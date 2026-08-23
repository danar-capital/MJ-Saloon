import { ammanDateParts, apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { assertSameOrigin, requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireStaffSession(request);
    const payload = await request.json() as {
      target?: "staff" | "service";
      id?: string;
      status?: "available" | "break" | "off_today" | "disabled";
      weeklyOffDay?: number | null;
    };
    if (!payload.id || !["staff", "service"].includes(payload.target ?? "")) {
      return Response.json({ error: "INVALID_STATUS_UPDATE" }, { status: 400 });
    }
    if (!viewer.isOwner && (payload.target !== "staff" || payload.id !== viewer.staffId)) {
      return Response.json({ error: "STAFF_UNAUTHORIZED" }, { status: 403 });
    }
    await ensureCatalogSeed();
    const db = getD1();
    if (payload.target === "staff" && Object.prototype.hasOwnProperty.call(payload, "weeklyOffDay")) {
      const weeklyOffDay = payload.weeklyOffDay;
      if (weeklyOffDay !== null && (typeof weeklyOffDay !== "number" || !Number.isInteger(weeklyOffDay) || weeklyOffDay < 0 || weeklyOffDay > 6)) {
        return Response.json({ error: "INVALID_WEEKLY_OFF_DAY" }, { status: 400 });
      }
      await db.prepare("UPDATE staff_members SET weekly_off_day = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(weeklyOffDay, payload.id).run();
      return Response.json({ ok: true });
    }
    const allowedStatuses = payload.target === "staff"
      ? ["available", "break", "off_today", "disabled"]
      : ["available", "off_today", "disabled"];
    if (!allowedStatuses.includes(payload.status ?? "")) {
      return Response.json({ error: "INVALID_STATUS_UPDATE" }, { status: 400 });
    }
    const table = payload.target === "staff" ? "staff_members" : "service_entries";
    const statusDate = payload.status === "off_today" || payload.status === "break" ? ammanDateParts().date : null;
    if (payload.target === "staff") {
      const statusStartedAt = payload.status === "break" ? new Date().toISOString() : null;
      await db.prepare("UPDATE staff_members SET status = ?, status_date = ?, status_started_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(payload.status, statusDate, statusStartedAt, payload.id).run();
    } else {
      await db.prepare(`UPDATE ${table} SET status = ?, status_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(payload.status, statusDate, payload.id).run();
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
