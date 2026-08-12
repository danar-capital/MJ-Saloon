import { apiError, assignAtStart, bookingDetails, ensureCatalogSeed, getD1, scheduleLockStatements, sendDecisionNotification } from "@/lib/booking-server";
import { assertOwner } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertOwner();
    await ensureCatalogSeed();
    const payload = await request.json() as { requestId?: string; decision?: "approve" | "reject"; note?: string };
    if (!payload.requestId || !["approve", "reject"].includes(payload.decision ?? "")) return Response.json({ error: "INVALID_DECISION" }, { status: 400 });
    const db = getD1();
    const change = await db.prepare("SELECT id, booking_id, type, requested_date, requested_start_minute, status FROM change_requests WHERE id = ?").bind(payload.requestId).first<{ id: string; booking_id: string; type: string; requested_date: string | null; requested_start_minute: number | null; status: string }>();
    if (!change || change.status !== "pending") return Response.json({ error: "REQUEST_NOT_PENDING" }, { status: 409 });
    if (payload.decision === "reject") {
      await db.prepare("UPDATE change_requests SET status = 'rejected', decision_note = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").bind(payload.note?.trim() || null, change.id).run();
      const customer = await db.prepare("SELECT phone, booking_code FROM booking_groups WHERE id = ?").bind(change.booking_id).first<{ phone: string; booking_code: string }>();
      if (customer) await sendDecisionNotification(customer.phone, `تم رفض طلب تعديل الحجز ${customer.booking_code}. حجزك الأصلي ما زال مؤكدًا. تواصل مع MJ للمساعدة.`);
      return Response.json({ ok: true, status: "rejected" });
    }
    if (change.type === "cancel") {
      await db.batch([
        db.prepare("DELETE FROM schedule_locks WHERE booking_id = ?").bind(change.booking_id),
        db.prepare("UPDATE booking_groups SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(change.booking_id),
        db.prepare("UPDATE booking_items SET status = 'cancelled' WHERE booking_id = ?").bind(change.booking_id),
        db.prepare("UPDATE change_requests SET status = 'approved', decision_note = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").bind(payload.note?.trim() || null, change.id),
      ]);
      const customer = await db.prepare("SELECT phone, booking_code FROM booking_groups WHERE id = ?").bind(change.booking_id).first<{ phone: string; booking_code: string }>();
      if (customer) await sendDecisionNotification(customer.phone, `تم اعتماد إلغاء الحجز ${customer.booking_code} من MJ.`);
      return Response.json({ ok: true, status: "approved" });
    }
    if (!change.requested_date || !Number.isInteger(change.requested_start_minute)) throw new Error("NEW_SLOT_REQUIRED");
    const details = await bookingDetails(change.booking_id);
    const existing = details.items as Array<{ id: string; service_id: string; staff_id: string; guest_label: string }>;
    const guests = existing.map((item) => ({ serviceId: item.service_id, staffId: item.staff_id, label: item.guest_label }));
    const allocation = await assignAtStart(change.requested_date, change.requested_start_minute!, guests, change.booking_id);
    if (!allocation) throw new Error("SLOT_UNAVAILABLE");
    try {
      await db.batch([
        db.prepare("DELETE FROM schedule_locks WHERE booking_id = ?").bind(change.booking_id),
        ...allocation.map((assigned, index) => db.prepare("UPDATE booking_items SET staff_id = ?, booking_date = ?, start_minute = ?, end_minute = ? WHERE id = ? AND booking_id = ?")
          .bind(assigned.staffId, change.requested_date, assigned.startMinute, assigned.endMinute, existing[index].id, change.booking_id)),
        ...scheduleLockStatements(db, change.booking_id, change.requested_date, allocation),
        db.prepare("UPDATE change_requests SET status = 'approved', decision_note = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").bind(payload.note?.trim() || null, change.id),
        db.prepare("UPDATE booking_groups SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(change.booking_id),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("schedule_locks") || message.includes("UNIQUE constraint")) throw new Error("SLOT_UNAVAILABLE");
      throw error;
    }
    const customer = await db.prepare("SELECT phone, booking_code FROM booking_groups WHERE id = ?").bind(change.booking_id).first<{ phone: string; booking_code: string }>();
    if (customer) await sendDecisionNotification(customer.phone, `تم اعتماد الموعد الجديد لحجز ${customer.booking_code}: ${change.requested_date} الساعة ${change.requested_start_minute}.`);
    return Response.json({ ok: true, status: "approved" });
  } catch (error) {
    return apiError(error);
  }
}
