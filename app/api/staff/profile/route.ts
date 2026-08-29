import { apiError, ensureCatalogSeed, getD1, normalizePhone, validPhone } from "@/lib/booking-server";
import { assertSameOrigin, requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireStaffSession(request);
    const payload = await request.json() as { staffId?: string; name?: string; whatsappPhone?: string };
    const staffId = payload.staffId?.trim() || viewer.staffId;
    if (!viewer.isOwner && staffId !== viewer.staffId) return Response.json({ error: "STAFF_UNAUTHORIZED" }, { status: 403 });
    const name = payload.name?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "";
    if (name.length < 2) return Response.json({ error: "INVALID_PROFILE_NAME" }, { status: 400 });
    const phone = normalizePhone(payload.whatsappPhone ?? "");
    if (!validPhone(phone)) return Response.json({ error: "INVALID_PHONE" }, { status: 400 });
    await ensureCatalogSeed();
    const db = getD1();
    const result = await db.prepare("UPDATE staff_members SET profile_name = ?, whatsapp_phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(name, phone, staffId).run();
    if (!result.meta.changes) return Response.json({ error: "STAFF_NOT_FOUND" }, { status: 404 });
    await db.prepare("INSERT INTO system_events (type, actor_id, payload) VALUES ('staff.profile_changed', ?, ?)")
      .bind(viewer.accountId, JSON.stringify({ staffId })).run();
    return Response.json({ profile: { staffId, name, whatsappPhone: phone } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
