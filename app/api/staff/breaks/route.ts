import { BOOKING_RULES } from "@/lib/booking-config";
import { apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { assertSameOrigin, requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
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
    const conflict = await db.prepare("SELECT bi.id FROM booking_items bi JOIN booking_groups bg ON bg.id = bi.booking_id WHERE bi.staff_id = ? AND bi.booking_date = ? AND bi.status IN ('confirmed', 'arrived', 'in_service') AND bg.status NOT IN ('cancelled', 'no_show') AND bi.start_minute < ? AND bi.end_minute > ? LIMIT 1")
      .bind(staffId, payload.date, end, start).first();
    if (conflict) return Response.json({ error: "BREAK_CONFLICT" }, { status: 409 });
    const overlap = await db.prepare("SELECT id FROM staff_breaks WHERE staff_id = ? AND break_date = ? AND status = 'active' AND start_minute < ? AND end_minute > ? LIMIT 1")
      .bind(staffId, payload.date, end, start).first();
    if (overlap) return Response.json({ error: "BREAK_OVERLAP" }, { status: 409 });
    const id = crypto.randomUUID();
    const claims: D1PreparedStatement[] = [];
    for (let minute = start; minute < end + BOOKING_RULES.internalBufferMinutes; minute += 5) {
      claims.push(db.prepare("INSERT INTO staff_time_claims (slot_key, owner_type, owner_id, staff_id, claim_date, minute) VALUES (?, 'break', ?, ?, ?, ?)")
        .bind(`${staffId}:${payload.date}:${minute}`, id, staffId, payload.date, minute));
    }
    try {
      await db.batch([
        db.prepare("INSERT INTO staff_breaks (id, staff_id, break_date, start_minute, end_minute, note, status, created_by) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)")
          .bind(id, staffId, payload.date, start, end, payload.note?.trim().slice(0, 120) || null, viewer.accountId),
        ...claims,
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("staff_time_claims") || message.includes("UNIQUE constraint")) return Response.json({ error: "BREAK_CONFLICT" }, { status: 409 });
      throw error;
    }
    return Response.json({ break: { id, staffId, date: payload.date, startMinute: start, endMinute: end } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireStaffSession(request);
    const payload = await request.json() as { id?: string };
    if (!payload.id) return Response.json({ error: "BREAK_ID_REQUIRED" }, { status: 400 });
    const db = getD1();
    const entry = await db.prepare("SELECT id, staff_id FROM staff_breaks WHERE id = ? AND status = 'active'").bind(payload.id).first<{ id: string; staff_id: string }>();
    if (!entry || (!viewer.isOwner && entry.staff_id !== viewer.staffId)) return Response.json({ error: "STAFF_UNAUTHORIZED" }, { status: 403 });
    await db.batch([
      db.prepare("UPDATE staff_breaks SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(entry.id),
      db.prepare("DELETE FROM staff_time_claims WHERE owner_type = 'break' AND owner_id = ?").bind(entry.id),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
