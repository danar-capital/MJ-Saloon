import { apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const viewer = await requireStaffSession(request);
    await ensureCatalogSeed();
    const db = getD1();
    const [staff, services, bookings, items, breaks] = await db.batch([
      viewer.isOwner
        ? db.prepare("SELECT id, name, role_ar, role_en, specialty, status, status_date, whatsapp_phone, sort_order FROM staff_members ORDER BY sort_order")
        : db.prepare("SELECT id, name, role_ar, role_en, specialty, status, status_date, whatsapp_phone, sort_order FROM staff_members WHERE id = ?").bind(viewer.staffId),
      db.prepare("SELECT id, category_id, name_ar, name_en, duration_minutes, price_ar, price_en, specialty, status, status_date, sort_order FROM service_entries ORDER BY sort_order"),
      viewer.isOwner
        ? db.prepare("SELECT id, booking_code, first_name, last_name, phone, locale, status, created_at FROM booking_groups ORDER BY created_at DESC LIMIT 500")
        : db.prepare("SELECT DISTINCT bg.id, bg.booking_code, bg.first_name, bg.last_name, bg.phone, bg.locale, bg.status, bg.created_at FROM booking_groups bg JOIN booking_items bi ON bi.booking_id = bg.id WHERE bi.staff_id = ? ORDER BY bg.created_at DESC LIMIT 250").bind(viewer.staffId),
      viewer.isOwner
        ? db.prepare("SELECT id, booking_id, guest_index, guest_label, service_id, staff_id, booking_date, start_minute, end_minute, status FROM booking_items ORDER BY booking_date, start_minute")
        : db.prepare("SELECT id, booking_id, guest_index, guest_label, service_id, staff_id, booking_date, start_minute, end_minute, status FROM booking_items WHERE staff_id = ? ORDER BY booking_date, start_minute").bind(viewer.staffId),
      viewer.isOwner
        ? db.prepare("SELECT id, staff_id, break_date, start_minute, end_minute, note, status, created_at FROM staff_breaks WHERE status = 'active' ORDER BY break_date, start_minute")
        : db.prepare("SELECT id, staff_id, break_date, start_minute, end_minute, note, status, created_at FROM staff_breaks WHERE staff_id = ? AND status = 'active' ORDER BY break_date, start_minute").bind(viewer.staffId),
    ]);
    return Response.json({ viewer, staff: staff.results, services: services.results, bookings: bookings.results, items: items.results, breaks: breaks.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
