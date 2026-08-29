import { ammanDateParts, apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const DEFAULT_UPCOMING_LIMIT = 80;
const MAX_UPCOMING_LIMIT = 200;

type DashboardItem = {
  id: string;
  booking_id: string;
  guest_index: number;
  guest_label: string;
  service_id: string;
  staff_id: string;
  booking_date: string;
  start_minute: number;
  end_minute: number;
  status: string;
  upcoming_candidate: number;
};

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function visibleItemsCte(staffScoped: boolean) {
  const staffFilter = staffScoped ? " AND staff_id = ?" : "";
  return `WITH visible_items AS (
    SELECT id, booking_id, guest_index, guest_label, service_id, staff_id, booking_date, start_minute, end_minute, status, 0 AS upcoming_candidate
    FROM booking_items
    WHERE (booking_date = ? OR booking_date = ?)${staffFilter}
    UNION ALL
    SELECT id, booking_id, guest_index, guest_label, service_id, staff_id, booking_date, start_minute, end_minute, status, 1 AS upcoming_candidate
    FROM (
      SELECT id, booking_id, guest_index, guest_label, service_id, staff_id, booking_date, start_minute, end_minute, status
      FROM booking_items
      WHERE booking_date > ? AND booking_date <> ?
        AND status IN ('confirmed', 'arrived', 'in_service')${staffFilter}
      ORDER BY booking_date, start_minute, id
      LIMIT ?
    ) AS upcoming_items
  )`;
}

export async function GET(request: Request) {
  try {
    const viewer = await requireStaffSession(request);
    await ensureCatalogSeed();
    const db = getD1();
    const today = ammanDateParts().date;
    const params = new URL(request.url).searchParams;
    const requestedDate = params.get("date");
    if (requestedDate !== null && !validIsoDate(requestedDate)) {
      return Response.json({ error: "INVALID_DASHBOARD_DATE" }, { status: 400 });
    }
    const displayDate = requestedDate ?? today;
    const requestedLimit = params.get("upcomingLimit");
    if (requestedLimit !== null && (!/^\d+$/.test(requestedLimit) || !Number.isSafeInteger(Number(requestedLimit)))) {
      return Response.json({ error: "INVALID_UPCOMING_LIMIT" }, { status: 400 });
    }
    const upcomingLimit = Math.min(MAX_UPCOMING_LIMIT, Math.max(1, requestedLimit === null ? DEFAULT_UPCOMING_LIMIT : Number(requestedLimit)));
    const requestedStaffId = params.get("staffId")?.trim() ?? "";
    if (requestedStaffId && requestedStaffId !== "all" && !/^[a-z0-9_-]{1,64}$/i.test(requestedStaffId)) {
      return Response.json({ error: "INVALID_STAFF_FILTER" }, { status: 400 });
    }
    const scopedStaffId = viewer.canViewAllBookings
      ? (requestedStaffId && requestedStaffId !== "all" ? requestedStaffId : null)
      : viewer.staffId;
    const staffScoped = Boolean(scopedStaffId);
    const cte = visibleItemsCte(staffScoped);
    const visibleBindings = (limit: number) => staffScoped
      ? [displayDate, today, scopedStaffId, today, displayDate, scopedStaffId, limit]
      : [displayDate, today, today, displayDate, limit];
    const itemStatement = db.prepare(`${cte}
      SELECT id, booking_id, guest_index, guest_label, service_id, staff_id, booking_date, start_minute, end_minute, status, upcoming_candidate
      FROM visible_items
      ORDER BY booking_date, start_minute, id`).bind(...visibleBindings(upcomingLimit + 1));
    const bookingStatement = db.prepare(`${cte}
      SELECT DISTINCT bg.id, bg.booking_code, bg.first_name, bg.last_name,
        COALESCE(NULLIF(bg.full_name, ''), TRIM(bg.first_name || ' ' || bg.last_name)) AS full_name,
        bg.phone, bg.locale, bg.status, bg.created_at
      FROM booking_groups bg
      JOIN visible_items bi ON bi.booking_id = bg.id
      ORDER BY bg.created_at DESC`).bind(...visibleBindings(upcomingLimit));
    const [staff, services, bookings, itemResult, schedules, sync] = await db.batch([
      viewer.canViewAllBookings
        ? db.prepare("SELECT id, COALESCE(NULLIF(profile_name, ''), name) AS name, role_ar, role_en, specialty, status, status_date, status_started_at, weekly_off_day, whatsapp_phone, profile_image_updated_at, sort_order FROM staff_members ORDER BY sort_order")
        : db.prepare("SELECT id, COALESCE(NULLIF(profile_name, ''), name) AS name, role_ar, role_en, specialty, status, status_date, status_started_at, weekly_off_day, whatsapp_phone, profile_image_updated_at, sort_order FROM staff_members WHERE id = ?").bind(viewer.staffId),
      db.prepare("SELECT id, category_id, name_ar, name_en, duration_minutes, price_ar, price_en, specialty, status, status_date, sort_order FROM service_entries ORDER BY sort_order"),
      bookingStatement,
      itemStatement,
      viewer.canViewAllBookings
        ? db.prepare("SELECT staff_id, weekday, start_minute, end_minute, active FROM staff_schedules ORDER BY staff_id, weekday")
        : db.prepare("SELECT staff_id, weekday, start_minute, end_minute, active FROM staff_schedules WHERE staff_id = ? ORDER BY weekday").bind(viewer.staffId),
      db.prepare("SELECT COALESCE(MAX(id), 0) AS version FROM system_events"),
    ]);
    const rawItems = itemResult.results as DashboardItem[];
    const upcomingHasMore = rawItems.filter((item) => item.upcoming_candidate === 1).length > upcomingLimit;
    let includedUpcoming = 0;
    const items = rawItems.flatMap(({ upcoming_candidate: upcomingCandidate, ...item }) => {
      if (upcomingCandidate === 1 && includedUpcoming++ >= upcomingLimit) return [];
      return [item];
    });
    const syncVersion = Number((sync.results as Array<{ version: number }>)[0]?.version ?? 0);
    return Response.json({ viewer, staff: staff.results, services: services.results, bookings: bookings.results, items, schedules: schedules.results, syncVersion, upcomingHasMore }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
