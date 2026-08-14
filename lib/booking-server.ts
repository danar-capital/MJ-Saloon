import { env } from "cloudflare:workers";
import {
  BOOKING_RULES,
  bookingServices,
  bookingStaff,
  getService,
  getStaff,
  type Locale,
} from "./booking-config";

export type GuestSelection = {
  serviceId: string;
  staffId: string;
  label?: string;
};

export type AssignedGuest = {
  guestIndex: number;
  serviceId: string;
  staffId: string;
  startMinute: number;
  endMinute: number;
  label: string;
};

type StatusRow = {
  id: string;
  status: "available" | "off_today" | "disabled";
  status_date: string | null;
};

type BusyRow = {
  staff_id: string;
  start_minute: number;
  end_minute: number;
};

type BreakRow = {
  staff_id: string;
  start_minute: number;
  end_minute: number;
};

const SALON_WHATSAPP = "962797799677";
const MUSTAFA_WHATSAPP = "962796152602";
let schemaReady = false;

export function getD1() {
  if (!env.DB) throw new Error("BOOKING_DB_UNAVAILABLE");
  return env.DB;
}

function runtimeEnv() {
  return env as unknown as Record<string, string | undefined>;
}

export async function ensureBookingSchema() {
  if (schemaReady) return;
  const db = getD1();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS staff_members (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, role_ar TEXT NOT NULL, role_en TEXT NOT NULL, specialty TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'available', status_date TEXT, sort_order INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS service_entries (id TEXT PRIMARY KEY NOT NULL, category_id TEXT NOT NULL, name_ar TEXT NOT NULL, name_en TEXT NOT NULL, duration_minutes INTEGER NOT NULL, price_ar TEXT NOT NULL, price_en TEXT NOT NULL, specialty TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'available', status_date TEXT, sort_order INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS booking_groups (id TEXT PRIMARY KEY NOT NULL, booking_code TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'ar', status TEXT NOT NULL DEFAULT 'confirmed', manage_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS booking_items (id TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL, guest_index INTEGER NOT NULL, guest_label TEXT NOT NULL, service_id TEXT NOT NULL, staff_id TEXT NOT NULL, booking_date TEXT NOT NULL, start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (booking_id) REFERENCES booking_groups(id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS schedule_locks (slot_key TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL, staff_id TEXT NOT NULL, booking_date TEXT NOT NULL, minute INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (booking_id) REFERENCES booking_groups(id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS otp_challenges (id TEXT PRIMARY KEY NOT NULL, phone TEXT NOT NULL, purpose TEXT NOT NULL, booking_id TEXT, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, verified_at INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS manage_sessions (id TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (booking_id) REFERENCES booking_groups(id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS change_requests (id TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL, type TEXT NOT NULL, requested_date TEXT, requested_start_minute INTEGER, payload TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending', decision_note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at TEXT, FOREIGN KEY (booking_id) REFERENCES booking_groups(id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_breaks (id TEXT PRIMARY KEY NOT NULL, staff_id TEXT NOT NULL, break_date TEXT NOT NULL, start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'active', created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (staff_id) REFERENCES staff_members(id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_breaks_schedule_idx ON staff_breaks (staff_id, break_date, start_minute, end_minute)"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_accounts (id TEXT PRIMARY KEY NOT NULL, staff_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL UNIQUE, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff', active INTEGER NOT NULL DEFAULT 1, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (staff_id) REFERENCES staff_members(id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_sessions (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (account_id) REFERENCES staff_accounts(id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_sessions_token_idx ON staff_sessions (token_hash, expires_at)"),
  ]);
  const staffColumns = await db.prepare("PRAGMA table_info(staff_members)").all<{ name: string }>();
  if (!staffColumns.results.some((column) => column.name === "whatsapp_phone")) {
    await db.prepare("ALTER TABLE staff_members ADD COLUMN whatsapp_phone TEXT").run();
  }
  schemaReady = true;
}

export function ammanDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_RULES.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("00962")) return digits.slice(2);
  if (digits.startsWith("962")) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return `962${digits.slice(1)}`;
  return digits;
}

export function validPhone(value: string) {
  const normalized = normalizePhone(value);
  return /^\d{9,15}$/.test(normalized);
}

export async function ensureCatalogSeed() {
  await ensureBookingSchema();
  const db = getD1();
  const today = ammanDateParts().date;
  const statements = [
    db.prepare("UPDATE staff_members SET status = 'available', status_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE status = 'off_today' AND status_date IS NOT NULL AND status_date <> ?").bind(today),
    db.prepare("UPDATE service_entries SET status = 'available', status_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE status = 'off_today' AND status_date IS NOT NULL AND status_date <> ?").bind(today),
    ...bookingStaff.map((member, index) =>
      db.prepare("INSERT INTO staff_members (id, name, role_ar, role_en, specialty, status, sort_order) VALUES (?, ?, ?, ?, ?, 'available', ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, role_ar = excluded.role_ar, role_en = excluded.role_en, specialty = excluded.specialty, sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP")
        .bind(member.id, member.name, member.role.ar, member.role.en, member.specialty, index),
    ),
    ...bookingServices.map((service, index) =>
      db.prepare("INSERT INTO service_entries (id, category_id, name_ar, name_en, duration_minutes, price_ar, price_en, specialty, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?) ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, name_ar = excluded.name_ar, name_en = excluded.name_en, duration_minutes = excluded.duration_minutes, price_ar = excluded.price_ar, price_en = excluded.price_en, specialty = excluded.specialty, sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP")
        .bind(service.id, service.categoryId, service.name.ar, service.name.en, service.durationMinutes, service.price.ar, service.price.en, service.specialty, index),
    ),
  ];
  await db.batch(statements);
}

export async function getPublicCatalog() {
  await ensureCatalogSeed();
  const db = getD1();
  const now = ammanDateParts();
  const [staffResult, servicesResult, breaksResult] = await db.batch([
    db.prepare("SELECT id, status, status_date FROM staff_members ORDER BY sort_order"),
    db.prepare("SELECT id, status, status_date FROM service_entries ORDER BY sort_order"),
    db.prepare("SELECT staff_id, start_minute, end_minute FROM staff_breaks WHERE break_date = ? AND status = 'active' AND start_minute <= ? AND end_minute > ?").bind(now.date, now.minutes, now.minutes),
  ]);
  const staffStatus = new Map((staffResult.results as StatusRow[]).map((row) => [row.id, row]));
  const serviceStatus = new Map((servicesResult.results as StatusRow[]).map((row) => [row.id, row]));
  return {
    rules: BOOKING_RULES,
    staff: bookingStaff.map((member) => ({
      ...member,
      ...(staffStatus.get(member.id) ?? { status: "available", status_date: null }),
      breakNow: (breaksResult.results as BreakRow[]).some((entry) => entry.staff_id === member.id),
    })),
    services: bookingServices.map((service) => ({ ...service, ...(serviceStatus.get(service.id) ?? { status: "available", status_date: null }) })),
  };
}

function statusAllowsDate(row: StatusRow | undefined, date: string) {
  if (!row || row.status === "available") return true;
  if (row.status === "disabled") return false;
  return row.status_date !== date;
}

function intervalsOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function dateWithinBookingWindow(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = ammanDateParts().date;
  const start = new Date(`${today}T00:00:00+03:00`).getTime();
  const target = new Date(`${date}T00:00:00+03:00`).getTime();
  const days = Math.round((target - start) / 86_400_000);
  return days >= 0 && days <= BOOKING_RULES.bookingHorizonDays;
}

async function scheduleContext(date: string, excludeBookingId?: string) {
  await ensureCatalogSeed();
  const db = getD1();
  const busyQuery = excludeBookingId
    ? db.prepare("SELECT bi.staff_id, bi.start_minute, bi.end_minute FROM booking_items bi JOIN booking_groups bg ON bg.id = bi.booking_id WHERE bi.booking_date = ? AND bi.status = 'confirmed' AND bg.status = 'confirmed' AND bi.booking_id <> ?").bind(date, excludeBookingId)
    : db.prepare("SELECT bi.staff_id, bi.start_minute, bi.end_minute FROM booking_items bi JOIN booking_groups bg ON bg.id = bi.booking_id WHERE bi.booking_date = ? AND bi.status = 'confirmed' AND bg.status = 'confirmed'").bind(date);
  const [staffResult, servicesResult, busyResult, breaksResult] = await db.batch([
    db.prepare("SELECT id, status, status_date FROM staff_members"),
    db.prepare("SELECT id, status, status_date FROM service_entries"),
    busyQuery,
    db.prepare("SELECT staff_id, start_minute, end_minute FROM staff_breaks WHERE break_date = ? AND status = 'active'").bind(date),
  ]);
  return {
    staffStatus: new Map((staffResult.results as StatusRow[]).map((row) => [row.id, row])),
    serviceStatus: new Map((servicesResult.results as StatusRow[]).map((row) => [row.id, row])),
    busy: busyResult.results as BusyRow[],
    breaks: breaksResult.results as BreakRow[],
  };
}

type ScheduleContext = Awaited<ReturnType<typeof scheduleContext>>;

function assignWithContext(date: string, groupStart: number, guests: GuestSelection[], context: ScheduleContext): AssignedGuest[] | null {
  const timelines = new Map<string, Array<{ start: number; end: number }>>();
  bookingStaff.forEach((member) => {
    timelines.set(member.id, [
      ...context.busy.filter((item) => item.staff_id === member.id).map((item) => ({ start: item.start_minute, end: item.end_minute })),
      ...context.breaks.filter((item) => item.staff_id === member.id).map((item) => ({ start: item.start_minute, end: item.end_minute })),
    ]);
  });
  const assigned: AssignedGuest[] = [];

  for (let guestIndex = 0; guestIndex < guests.length; guestIndex += 1) {
    const guest = guests[guestIndex];
    const service = getService(guest.serviceId);
    if (!service || !statusAllowsDate(context.serviceStatus.get(service.id), date)) return null;
    const eligible = bookingStaff.filter((member) => {
      if (member.specialty !== service.specialty) return false;
      if (!statusAllowsDate(context.staffStatus.get(member.id), date)) return false;
      return guest.staffId === "any" || guest.staffId === member.id;
    });
    if (!eligible.length) return null;

    const candidates = eligible.flatMap((member) => {
      const earlierForStaff = assigned.filter((item) => item.staffId === member.id);
      const desiredStart = earlierForStaff.length
        ? Math.max(...earlierForStaff.map((item) => item.endMinute + BOOKING_RULES.internalBufferMinutes))
        : groupStart;
      const desiredEnd = desiredStart + service.durationMinutes;
      if (desiredStart < BOOKING_RULES.openingMinutes || desiredEnd > BOOKING_RULES.closingMinutes) return [];
      const blocked = (timelines.get(member.id) ?? []).some((interval) =>
        intervalsOverlap(desiredStart, desiredEnd + BOOKING_RULES.internalBufferMinutes, interval.start, interval.end + BOOKING_RULES.internalBufferMinutes),
      );
      if (blocked) return [];
      return [{ member, start: desiredStart, end: desiredEnd, load: earlierForStaff.length }];
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.start - b.start || a.load - b.load || bookingStaff.findIndex((member) => member.id === a.member.id) - bookingStaff.findIndex((member) => member.id === b.member.id));
    const selected = candidates[0];
    const item = {
      guestIndex,
      serviceId: service.id,
      staffId: selected.member.id,
      startMinute: selected.start,
      endMinute: selected.end,
      label: guest.label?.trim() || `${guestIndex + 1}`,
    };
    assigned.push(item);
    timelines.get(selected.member.id)?.push({ start: selected.start, end: selected.end });
  }
  return assigned;
}

export async function assignAtStart(date: string, groupStart: number, guests: GuestSelection[], excludeBookingId?: string): Promise<AssignedGuest[] | null> {
  if (!dateWithinBookingWindow(date) || !Number.isInteger(groupStart) || guests.length < 1) return null;
  const context = await scheduleContext(date, excludeBookingId);
  return assignWithContext(date, groupStart, guests, context);
}

export async function findAvailability(date: string, guests: GuestSelection[], excludeBookingId?: string) {
  if (!dateWithinBookingWindow(date)) return [];
  const now = ammanDateParts();
  const minimum = date === now.date
    ? Math.ceil((now.minutes + BOOKING_RULES.leadMinutes) / BOOKING_RULES.slotMinutes) * BOOKING_RULES.slotMinutes
    : BOOKING_RULES.openingMinutes;
  const first = Math.max(BOOKING_RULES.openingMinutes, minimum);
  const startInterval = guests.reduce((interval, guest) => Math.max(interval, getService(guest.serviceId)?.startIntervalMinutes ?? BOOKING_RULES.slotMinutes), BOOKING_RULES.slotMinutes);
  const slots: Array<{ startMinute: number; assignments: AssignedGuest[] }> = [];
  const context = await scheduleContext(date, excludeBookingId);
  for (let start = first; start <= BOOKING_RULES.latestStartMinutes; start += BOOKING_RULES.slotMinutes) {
    if (start % startInterval !== 0) continue;
    const assignments = assignWithContext(date, start, guests, context);
    if (assignments) slots.push({ startMinute: start, assignments });
  }
  return slots;
}

export function scheduleLockStatements(db: D1Database, bookingId: string, date: string, assignments: AssignedGuest[]) {
  return assignments.flatMap((item) => {
    const statements: D1PreparedStatement[] = [];
    for (let minute = item.startMinute; minute < item.endMinute + BOOKING_RULES.internalBufferMinutes; minute += 5) {
      statements.push(
        db.prepare("INSERT INTO schedule_locks (slot_key, booking_id, staff_id, booking_date, minute) VALUES (?, ?, ?, ?, ?)")
          .bind(`${item.staffId}:${date}:${minute}`, bookingId, item.staffId, date, minute),
      );
    }
    return statements;
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createOtp(phoneValue: string, purpose: "booking" | "manage", bookingId?: string) {
  const phone = normalizePhone(phoneValue);
  if (!validPhone(phone)) throw new Error("INVALID_PHONE");
  await ensureBookingSchema();
  const db = getD1();
  const recent = await db.prepare("SELECT COUNT(*) AS count FROM otp_challenges WHERE phone = ? AND created_at >= datetime('now', '-10 minutes')")
    .bind(phone).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 5) throw new Error("OTP_RATE_LIMITED");
  const id = crypto.randomUUID();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await sha256(`${id}:${code}`);
  const expiresAt = Date.now() + 5 * 60_000;
  await db.prepare("INSERT INTO otp_challenges (id, phone, purpose, booking_id, code_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, phone, purpose, bookingId ?? null, codeHash, expiresAt).run();
  const delivery = await sendAuthenticationTemplate(phone, code);
  return { id, expiresAt, delivered: delivery.delivered, devCode: delivery.delivered ? undefined : code };
}

export async function verifyOtp(challengeId: string, code: string, purpose: "booking" | "manage") {
  const db = getD1();
  const challenge = await db.prepare("SELECT id, phone, purpose, booking_id, code_hash, expires_at, attempts, verified_at FROM otp_challenges WHERE id = ?")
    .bind(challengeId).first<{ id: string; phone: string; purpose: string; booking_id: string | null; code_hash: string; expires_at: number; attempts: number; verified_at: number | null }>();
  if (!challenge || challenge.purpose !== purpose) throw new Error("OTP_NOT_FOUND");
  if (challenge.verified_at) throw new Error("OTP_ALREADY_USED");
  if (challenge.expires_at < Date.now()) throw new Error("OTP_EXPIRED");
  if (challenge.attempts >= 5) throw new Error("OTP_LOCKED");
  const supplied = await sha256(`${challenge.id}:${code.replace(/\D/g, "")}`);
  if (supplied !== challenge.code_hash) {
    await db.prepare("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?").bind(challenge.id).run();
    throw new Error("OTP_INVALID");
  }
  return challenge;
}

export async function createBooking(input: {
  challengeId: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string;
  locale: Locale;
  date: string;
  startMinute: number;
  guests: GuestSelection[];
}) {
  const firstName = input.firstName.trim().slice(0, 80);
  const lastName = input.lastName.trim().slice(0, 80);
  if (!firstName || !lastName) throw new Error("NAME_REQUIRED");
  if (!input.guests.length) throw new Error("GUESTS_REQUIRED");
  const challenge = await verifyOtp(input.challengeId, input.code, "booking");
  const phone = normalizePhone(input.phone);
  if (phone !== challenge.phone) throw new Error("PHONE_MISMATCH");
  const assignments = await assignAtStart(input.date, input.startMinute, input.guests);
  if (!assignments) throw new Error("SLOT_UNAVAILABLE");

  const db = getD1();
  const id = crypto.randomUUID();
  const manageToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const compactDate = input.date.replaceAll("-", "").slice(2);
  const bookingCode = `MJ-${compactDate}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  const statements = [
    db.prepare("UPDATE otp_challenges SET verified_at = ? WHERE id = ? AND verified_at IS NULL").bind(Date.now(), challenge.id),
    db.prepare("INSERT INTO booking_groups (id, booking_code, first_name, last_name, phone, locale, status, manage_token) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?)")
      .bind(id, bookingCode, firstName, lastName, phone, input.locale, manageToken),
    ...assignments.map((item) =>
      db.prepare("INSERT INTO booking_items (id, booking_id, guest_index, guest_label, service_id, staff_id, booking_date, start_minute, end_minute, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')")
        .bind(crypto.randomUUID(), id, item.guestIndex, item.label, item.serviceId, item.staffId, input.date, item.startMinute, item.endMinute),
    ),
    ...scheduleLockStatements(db, id, input.date, assignments),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("schedule_locks") || message.includes("UNIQUE constraint")) throw new Error("SLOT_UNAVAILABLE");
    throw error;
  }
  const summary = bookingSummaryText({ bookingCode, firstName, lastName, phone, date: input.date, assignments, locale: input.locale });
  const staffIds = [...new Set(assignments.map((item) => item.staffId))];
  const staffPlaceholders = staffIds.map(() => "?").join(",");
  const staffPhones = staffIds.length
    ? await db.prepare(`SELECT whatsapp_phone FROM staff_members WHERE id IN (${staffPlaceholders}) AND whatsapp_phone IS NOT NULL AND whatsapp_phone <> ''`).bind(...staffIds).all<{ whatsapp_phone: string }>()
    : { results: [] as Array<{ whatsapp_phone: string }> };
  await sendBookingNotifications({
    phone,
    ownerPhone: MUSTAFA_WHATSAPP,
    staffPhones: staffPhones.results.map((row) => normalizePhone(row.whatsapp_phone)),
    summary,
  });
  return {
    bookingId: id,
    bookingCode,
    assignments,
    salonWhatsAppUrl: `https://wa.me/${SALON_WHATSAPP}?text=${encodeURIComponent(summary)}`,
  };
}

export function bookingSummaryText(input: { bookingCode: string; firstName: string; lastName: string; phone: string; date: string; assignments: AssignedGuest[]; locale: Locale }) {
  const lines = input.assignments.map((item, index) => {
    const service = getService(item.serviceId);
    const staff = getStaff(item.staffId);
    const hour = `${String(Math.floor(item.startMinute / 60)).padStart(2, "0")}:${String(item.startMinute % 60).padStart(2, "0")}`;
    return `${index + 1}. ${service?.name[input.locale] ?? item.serviceId} — ${staff?.name ?? item.staffId} — ${hour}`;
  });
  return [
    `حجز جديد في MJ · ${input.bookingCode}`,
    `${input.firstName} ${input.lastName}`,
    `+${input.phone}`,
    input.date,
    ...lines,
  ].join("\n");
}

async function sendAuthenticationTemplate(phone: string, code: string) {
  const runtime = runtimeEnv();
  const token = runtime.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = runtime.WHATSAPP_PHONE_NUMBER_ID;
  const template = runtime.WHATSAPP_AUTH_TEMPLATE;
  if (!token || !phoneNumberId || !template) return { delivered: false };
  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: template,
        language: { code: "ar" },
        components: [{ type: "body", parameters: [{ type: "text", text: code }] }, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] }],
      },
    }),
  });
  return { delivered: response.ok };
}

async function sendTemplate(phone: string, templateName: string | undefined, summary: string) {
  const runtime = runtimeEnv();
  const token = runtime.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = runtime.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId || !templateName) return false;
  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: { name: templateName, language: { code: "ar" }, components: [{ type: "body", parameters: [{ type: "text", text: summary.slice(0, 950) }] }] },
    }),
  });
  return response.ok;
}

async function sendBookingNotifications(input: { phone: string; ownerPhone: string; staffPhones: string[]; summary: string }) {
  const runtime = runtimeEnv();
  const teamRecipients = [...new Set([input.ownerPhone, ...input.staffPhones].filter(Boolean))];
  await Promise.allSettled([
    sendTemplate(input.phone, runtime.WHATSAPP_CUSTOMER_TEMPLATE, input.summary),
    ...teamRecipients.map((recipient) => sendTemplate(recipient, runtime.WHATSAPP_STAFF_TEMPLATE ?? runtime.WHATSAPP_OWNER_TEMPLATE, input.summary)),
  ]);
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const status = ["INVALID_PHONE", "NAME_REQUIRED", "GUESTS_REQUIRED", "INVALID_USERNAME", "WEAK_PASSWORD", "USERNAME_TAKEN", "STAFF_NOT_FOUND"].includes(message) ? 400
    : ["OTP_INVALID", "OTP_EXPIRED", "OTP_LOCKED", "OTP_ALREADY_USED"].includes(message) ? 401
      : message === "OTP_RATE_LIMITED" ? 429
      : message === "STAFF_UNAUTHORIZED" ? 403
      : ["SLOT_UNAVAILABLE"].includes(message) ? 409
        : message === "BOOKING_NOT_FOUND" ? 404 : 500;
  return Response.json({ error: message }, { status });
}
