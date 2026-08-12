import { ammanDateParts, apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { assertOwner } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertOwner();
    const payload = await request.json() as { target?: "staff" | "service"; id?: string; status?: "available" | "off_today" | "disabled" };
    if (!payload.id || !["staff", "service"].includes(payload.target ?? "") || !["available", "off_today", "disabled"].includes(payload.status ?? "")) {
      return Response.json({ error: "INVALID_STATUS_UPDATE" }, { status: 400 });
    }
    await ensureCatalogSeed();
    const db = getD1();
    const table = payload.target === "staff" ? "staff_members" : "service_entries";
    const statusDate = payload.status === "off_today" ? ammanDateParts().date : null;
    await db.prepare(`UPDATE ${table} SET status = ?, status_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(payload.status, statusDate, payload.id).run();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
