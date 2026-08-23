import { waitUntil } from "cloudflare:workers";
import { ammanDateParts, apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { drainStaffPushOutbox } from "@/lib/push-server";
import { requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const viewer = await requireStaffSession(request);
    await ensureCatalogSeed();
    const db = getD1();
    const today = ammanDateParts().date;
    const rangeStart = shiftIsoDate(today, -45);
    const rangeEnd = shiftIsoDate(today, 365);
    const [staff, services, bookings, items, breaks, schedules] = await db.batch([
      viewer.canViewAllBookings
        ? db.prepare("SELECT id, COALESCE(NULLIF(profile_name, ''), name) AS name, role_ar, role_en, specialty, status, status_date, status_started_at, weekly_off_day, whatsapp_phone, profile_image_updated_at, sort_order FROM staff_members ORDER BY sort_order")
        : db.prepare("SELECT id, COALESCE(NULLIF(profile_name, ''), name) AS name, role_ar, role_en, specialty, status, status_date, status_started_at, weekly_off_day, whatsapp_phone, profile_image_updated_at, sort_order FROM staff_members WHERE id = ?").bind(viewer.staffId),
      db.prepare("SELECT id, category_id, name_ar, name_en, duration_minutes, price_ar, price_en, specialty, status, status_date, sort_order FROM service_entries ORDER BY sort_order"),
      viewer.canViewAllBookings
        ? db.prepare("SELECT DISTINCT bg.id, bg.booking_code, bg.first_name, bg.last_name, COALESCE(NULLIF(bg.full_name, ''), TRIM(bg.first_name || ' ' || bg.last_name)) AS full_name, bg.phone, bg.locale, bg.status, bg.created_at FROM booking_groups bg JOIN booking_items bi ON bi.booking_id = bg.id WHERE bi.booking_date BETWEEN ? AND ? ORDER BY bg.created_at DESC").bind(rangeStart, rangeEnd)
        : db.prepare("SELECT DISTINCT bg.id, bg.booking_code, bg.first_name, bg.last_name, COALESCE(NULLIF(bg.full_name, ''), TRIM(bg.first_name || ' ' || bg.last_name)) AS full_name, bg.phone, bg.locale, bg.status, bg.created_at FROM booking_groups bg JOIN booking_items bi ON bi.booking_id = bg.id WHERE bi.staff_id = ? AND bi.booking_date BETWEEN ? AND ? ORDER BY bg.created_at DESC").bind(viewer.staffId, rangeStart, rangeEnd),
      viewer.canViewAllBookings
        ? db.prepare("SELECT id, booking_id, guest_index, guest_label, service_id, staff_id, booking_date, start_minute, end_minute, status FROM booking_items WHERE booking_date BETWEEN ? AND ? ORDER BY booking_date, start_minute").bind(rangeStart, rangeEnd)
        : db.prepare("SELECT id, booking_id, guest_index, guest_label, service_id, staff_id, booking_date, start_minute, end_minute, status FROM booking_items WHERE staff_id = ? AND booking_date BETWEEN ? AND ? ORDER BY booking_date, start_minute").bind(viewer.staffId, rangeStart, rangeEnd),
      viewer.canViewAllBookings
        ? db.prepare("SELECT id, staff_id, break_date, start_minute, end_minute, note, status, created_at FROM staff_breaks WHERE status = 'active' AND break_date BETWEEN ? AND ? ORDER BY break_date, start_minute").bind(rangeStart, rangeEnd)
        : db.prepare("SELECT id, staff_id, break_date, start_minute, end_minute, note, status, created_at FROM staff_breaks WHERE staff_id = ? AND status = 'active' AND break_date BETWEEN ? AND ? ORDER BY break_date, start_minute").bind(viewer.staffId, rangeStart, rangeEnd),
      viewer.canViewAllBookings
        ? db.prepare("SELECT staff_id, weekday, start_minute, end_minute, active FROM staff_schedules ORDER BY staff_id, weekday")
        : db.prepare("SELECT staff_id, weekday, start_minute, end_minute, active FROM staff_schedules WHERE staff_id = ? ORDER BY weekday").bind(viewer.staffId),
    ]);
    waitUntil(drainStaffPushOutbox(viewer.canViewAllBookings ? undefined : viewer.staffId));
    return Response.json({ viewer, staff: staff.results, services: services.results, bookings: bookings.results, items: items.results, breaks: breaks.results, schedules: schedules.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
