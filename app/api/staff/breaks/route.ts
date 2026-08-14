import { BOOKING_RULES } from "@/lib/booking-config";
import { apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const viewer = await requireStaffSession(request);
    await ensureCatalogSeed();
    const payload = await request.json() as { staffId?: string; date?: string; startMinute?: number; endMinute?: number; note?: string };
    const staffId = viewer.isOwner ? payload.staffId : viewer.staffId;
    if (!staffId || !payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date) || !Number.isInteger(payload.startMinute) || !Number.isInteger(payload.endMinute)) {
      return Response.json({ error: "INVALID_BREAK" }, { status: 400 });
    }
    const start = payload.startMinute!;
    const end = payload.endMinute!;
    if (start < BOOKING_RULES.openingMinutes || end > BOOKING_RULES.closingMinutes || start >= end || start % 30 !== 0 || end % 30 !== 0) {
      return Response.json({ error: "INVALID_BREAK" }, { status: 400 });
    }
    const db = getD1();
    const conflict = await db.prepare("SELECT bi.id FROM booking_items bi JOIN booking_groups bg ON bg.id = bi.booking_id WHERE bi.staff_id = ? AND bi.booking_date = ? AND bi.status = 'confirmed' AND bg.status = 'confirmed' AND bi.start_minute < ? AND bi.end_minute > ? LIMIT 1")
      .bind(staffId, payload.date, end, start).first();
    if (conflict) return Response.json({ error: "BREAK_CONFLICT" }, { status: 409 });
    const overlap = await db.prepare("SELECT id FROM staff_breaks WHERE staff_id = ? AND break_date = ? AND status = 'active' AND start_minute < ? AND end_minute > ? LIMIT 1")
      .bind(staffId, payload.date, end, start).first();
    if (overlap) return Response.json({ error: "BREAK_OVERLAP" }, { status: 409 });
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO staff_breaks (id, staff_id, break_date, start_minute, end_minute, note, status, created_by) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)")
      .bind(id, staffId, payload.date, start, end, payload.note?.trim().slice(0, 120) || null, viewer.accountId).run();
    return Response.json({ break: { id, staffId, date: payload.date, startMinute: start, endMinute: end } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const viewer = await requireStaffSession(request);
    const payload = await request.json() as { id?: string };
    if (!payload.id) return Response.json({ error: "BREAK_ID_REQUIRED" }, { status: 400 });
    const db = getD1();
    const entry = await db.prepare("SELECT id, staff_id FROM staff_breaks WHERE id = ? AND status = 'active'").bind(payload.id).first<{ id: string; staff_id: string }>();
    if (!entry || (!viewer.isOwner && entry.staff_id !== viewer.staffId)) return Response.json({ error: "STAFF_UNAUTHORIZED" }, { status: 403 });
    await db.prepare("UPDATE staff_breaks SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(entry.id).run();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
