import { ammanDateParts, apiError, getD1 } from "@/lib/booking-server";
import { bookingStatusTimingAllowed, type OperationalBookingStatus } from "@/lib/booking-status";
import { assertSameOrigin, requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const transitions: Record<string, string[]> = {
  confirmed: ["arrived", "cancelled", "no_show"],
  arrived: ["in_service", "cancelled", "no_show"],
  in_service: ["completed"],
};

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireStaffSession(request);
    const payload = await request.json() as { itemId?: string; status?: string };
    if (!payload.itemId || !payload.status) return Response.json({ error: "BOOKING_STATUS_REQUIRED" }, { status: 400 });
    const db = getD1();
    const item = await db.prepare("SELECT id, booking_id, staff_id, status, booking_date, start_minute, end_minute FROM booking_items WHERE id = ?")
      .bind(payload.itemId).first<{ id: string; booking_id: string; staff_id: string; status: string; booking_date: string; start_minute: number; end_minute: number }>();
    if (!item || (!viewer.canViewAllBookings && item.staff_id !== viewer.staffId)) return Response.json({ error: "STAFF_UNAUTHORIZED" }, { status: 403 });
    if (!transitions[item.status]?.includes(payload.status)) return Response.json({ error: "INVALID_BOOKING_STATUS_TRANSITION" }, { status: 409 });
    const now = ammanDateParts();
    if (!bookingStatusTimingAllowed(payload.status as OperationalBookingStatus, {
      bookingDate: item.booking_date,
      startMinute: item.start_minute,
      endMinute: item.end_minute,
    }, now)) {
      return Response.json({ error: "BOOKING_STATUS_TOO_EARLY" }, { status: 409 });
    }
    const transitionStatements: D1PreparedStatement[] = [
      db.prepare("UPDATE booking_items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ? RETURNING id")
        .bind(payload.status, item.id, item.status),
      db.prepare("INSERT INTO system_events (type, actor_id, payload) SELECT 'booking_item.status_changed', ?, ? WHERE changes() > 0")
        .bind(viewer.accountId, JSON.stringify({ itemId: item.id, bookingId: item.booking_id, from: item.status, to: payload.status })),
    ];
    if (["completed", "cancelled", "no_show"].includes(payload.status)) {
      transitionStatements.push(db.prepare("DELETE FROM staff_time_claims WHERE owner_type = 'booking_item' AND owner_id = ? AND EXISTS (SELECT 1 FROM booking_items WHERE id = ? AND status = ?)")
        .bind(item.id, item.id, payload.status));
    }
    transitionStatements.push(
      db.prepare(`UPDATE booking_groups SET status = CASE
        WHEN EXISTS (SELECT 1 FROM booking_items WHERE booking_id = ? AND status = 'in_service') THEN 'in_service'
        WHEN EXISTS (SELECT 1 FROM booking_items WHERE booking_id = ? AND status = 'arrived') THEN 'arrived'
        WHEN EXISTS (SELECT 1 FROM booking_items WHERE booking_id = ? AND status = 'confirmed') THEN 'confirmed'
        WHEN EXISTS (SELECT 1 FROM booking_items WHERE booking_id = ? AND status = 'completed') THEN 'completed'
        WHEN EXISTS (SELECT 1 FROM booking_items WHERE booking_id = ? AND status = 'no_show') THEN 'no_show'
        ELSE 'cancelled' END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(item.booking_id, item.booking_id, item.booking_id, item.booking_id, item.booking_id, item.booking_id),
      db.prepare("DELETE FROM schedule_locks WHERE booking_id = ? AND NOT EXISTS (SELECT 1 FROM booking_items WHERE booking_id = ? AND status IN ('confirmed', 'arrived', 'in_service'))")
        .bind(item.booking_id, item.booking_id),
    );
    const [updateResult] = await db.batch(transitionStatements);
    const updated = (updateResult.results as Array<{ id: string }>)[0];
    if (!updated) return Response.json({ error: "BOOKING_STATUS_CHANGED" }, { status: 409 });
    return Response.json({ itemId: item.id, status: payload.status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
