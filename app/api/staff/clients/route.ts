import { ammanDateParts, apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

type ClientRow = {
  phone: string;
  full_name: string;
  booking_count: number;
  first_booking_date: string;
  last_booking_date: string;
  next_booking_date: string | null;
  staff_ids: string;
};

export async function GET(request: Request) {
  try {
    const viewer = await requireStaffSession(request);
    await ensureCatalogSeed();
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const requestedStaff = (url.searchParams.get("staffId") ?? "").trim();
    const staffId = viewer.canViewAllBookings ? (requestedStaff && requestedStaff !== "all" ? requestedStaff : null) : viewer.staffId;
    const search = `%${query}%`;
    const scopeClause = staffId ? "AND bi.staff_id = ?" : "";
    const sql = `
      WITH base AS (
        SELECT DISTINCT
          bg.id AS booking_id,
          COALESCE(NULLIF(bg.full_name, ''), TRIM(bg.first_name || ' ' || bg.last_name)) AS full_name,
          bg.phone,
          bi.staff_id,
          bi.booking_date,
          bg.created_at
        FROM booking_groups bg
        JOIN booking_items bi ON bi.booking_id = bg.id
        WHERE bg.status NOT IN ('cancelled', 'no_show')
          AND bi.status <> 'cancelled'
          ${scopeClause}
      ), scoped AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at DESC, booking_id DESC) AS name_rank
        FROM base
      )
      SELECT
        phone,
        MAX(CASE WHEN name_rank = 1 THEN full_name END) AS full_name,
        COUNT(DISTINCT booking_id) AS booking_count,
        MIN(booking_date) AS first_booking_date,
        MAX(booking_date) AS last_booking_date,
        MIN(CASE WHEN booking_date >= ? THEN booking_date END) AS next_booking_date,
        GROUP_CONCAT(DISTINCT staff_id) AS staff_ids
      FROM scoped
      WHERE (? = '' OR full_name LIKE ? COLLATE NOCASE OR phone LIKE ?)
      GROUP BY phone
      ORDER BY last_booking_date DESC, full_name COLLATE NOCASE
      LIMIT 200
    `;
    const statement = getD1().prepare(sql);
    const bindings = staffId
      ? [staffId, ammanDateParts().date, query, search, search]
      : [ammanDateParts().date, query, search, search];
    const result = await statement.bind(...bindings).all<ClientRow>();
    return Response.json({ clients: result.results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
