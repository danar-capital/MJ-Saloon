import { apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { assertOwner } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await assertOwner();
    await ensureCatalogSeed();
    const db = getD1();
    const [staff, services, bookings, items, requests] = await db.batch([
      db.prepare("SELECT id, name, role_ar, role_en, specialty, status, status_date, sort_order FROM staff_members ORDER BY sort_order"),
      db.prepare("SELECT id, category_id, name_ar, name_en, duration_minutes, price_ar, price_en, specialty, status, status_date, sort_order FROM service_entries ORDER BY sort_order"),
      db.prepare("SELECT id, booking_code, first_name, last_name, phone, locale, status, created_at FROM booking_groups ORDER BY created_at DESC LIMIT 250"),
      db.prepare("SELECT id, booking_id, guest_index, guest_label, service_id, staff_id, booking_date, start_minute, end_minute, status FROM booking_items ORDER BY booking_date, start_minute"),
      db.prepare("SELECT cr.id, cr.booking_id, cr.type, cr.requested_date, cr.requested_start_minute, cr.status, cr.created_at, cr.decided_at, cr.decision_note, bg.booking_code, bg.first_name, bg.last_name, bg.phone FROM change_requests cr JOIN booking_groups bg ON bg.id = cr.booking_id ORDER BY cr.created_at DESC LIMIT 100"),
    ]);
    return Response.json({ staff: staff.results, services: services.results, bookings: bookings.results, items: items.results, requests: requests.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
