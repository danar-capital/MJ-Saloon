import { env, waitUntil } from "cloudflare:workers";
import { deliverStaffPushOutboxWithRetry } from "./push-server";
import {
  BOOKING_RULES,
  bookingServices,
  bookingStaff,
  getService,
  getStaff,
  staffOperationalDefaults,
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
  resourceLabel?: string;
};

type StatusRow = {
  id: string;
  status: "available" | "break" | "off_today" | "disabled";
  status_date: string | null;
  status_started_at?: string | null;
  weekly_off_day?: number | null;
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

type ScheduleRow = {
  staff_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
  active: number;
};

const SALON_WHATSAPP = "962797799677";
const MUSTAFA_WHATSAPP = "962796152602";
const STAFF_OPERATIONS_MIGRATION = "staff-operations-2026-08-21-v1";
let schemaReady = false;
let seededDate: string | null = null;

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
    db.prepare("CREATE TABLE IF NOT EXISTS staff_members (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, role_ar TEXT NOT NULL, role_en TEXT NOT NULL, specialty TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'available', status_date TEXT, status_started_at TEXT, weekly_off_day INTEGER, whatsapp_phone TEXT, profile_name TEXT, profile_image_key TEXT, profile_image_updated_at TEXT, sort_order INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS service_entries (id TEXT PRIMARY KEY NOT NULL, category_id TEXT NOT NULL, name_ar TEXT NOT NULL, name_en TEXT NOT NULL, duration_minutes INTEGER NOT NULL, price_ar TEXT NOT NULL, price_en TEXT NOT NULL, specialty TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'available', status_date TEXT, sort_order INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS booking_groups (id TEXT PRIMARY KEY NOT NULL, booking_code TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL, last_name TEXT NOT NULL, full_name TEXT, phone TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'ar', status TEXT NOT NULL DEFAULT 'confirmed', manage_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS booking_items (id TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL, guest_index INTEGER NOT NULL, guest_label TEXT NOT NULL, service_id TEXT NOT NULL, staff_id TEXT NOT NULL, booking_date TEXT NOT NULL, start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (booking_id) REFERENCES booking_groups(id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS booking_items_staff_booking_idx ON booking_items (staff_id, booking_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS booking_groups_phone_created_idx ON booking_groups (phone, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS schedule_locks (slot_key TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL, staff_id TEXT NOT NULL, booking_date TEXT NOT NULL, minute INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (booking_id) REFERENCES booking_groups(id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS otp_challenges (id TEXT PRIMARY KEY NOT NULL, phone TEXT NOT NULL, purpose TEXT NOT NULL, booking_id TEXT, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, verified_at INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS otp_redemptions (challenge_id TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL UNIQUE, redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS manage_sessions (id TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (booking_id) REFERENCES booking_groups(id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS change_requests (id TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL, type TEXT NOT NULL, requested_date TEXT, requested_start_minute INTEGER, payload TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending', decision_note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at TEXT, FOREIGN KEY (booking_id) REFERENCES booking_groups(id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_breaks (id TEXT PRIMARY KEY NOT NULL, staff_id TEXT NOT NULL, break_date TEXT NOT NULL, start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'active', created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (staff_id) REFERENCES staff_members(id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_breaks_schedule_idx ON staff_breaks (staff_id, break_date, start_minute, end_minute)"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_time_claims (slot_key TEXT PRIMARY KEY NOT NULL, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, staff_id TEXT NOT NULL, claim_date TEXT NOT NULL, minute INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (staff_id) REFERENCES staff_members(id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_time_claims_owner_idx ON staff_time_claims (owner_type, owner_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_time_claims_staff_date_idx ON staff_time_claims (staff_id, claim_date, minute)"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_schedules (id TEXT PRIMARY KEY NOT NULL, staff_id TEXT NOT NULL, weekday INTEGER NOT NULL, start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (staff_id) REFERENCES staff_members(id))"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS staff_schedules_staff_day_unique ON staff_schedules (staff_id, weekday)"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_schedules_day_idx ON staff_schedules (weekday, staff_id)"),
    db.prepare("CREATE TABLE IF NOT EXISTS system_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, actor_id TEXT, payload TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS system_events_created_idx ON system_events (created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_accounts (id TEXT PRIMARY KEY NOT NULL, staff_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL UNIQUE, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff', active INTEGER NOT NULL DEFAULT 1, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER, must_change_credentials INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (staff_id) REFERENCES staff_members(id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_sessions (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (account_id) REFERENCES staff_accounts(id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_sessions_token_idx ON staff_sessions (token_hash, expires_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_login_attempts (bucket_key TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, blocked_until INTEGER, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_push_subscriptions (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_agent TEXT, expires_at INTEGER NOT NULL, failure_count INTEGER NOT NULL DEFAULT 0, last_success_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (account_id) REFERENCES staff_accounts(id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_push_subscriptions_account_idx ON staff_push_subscriptions (account_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_push_outbox (id TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL, staff_id TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, delivered_at TEXT, last_error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (booking_id) REFERENCES booking_groups(id), FOREIGN KEY (staff_id) REFERENCES staff_members(id))"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS staff_push_outbox_booking_staff_unique ON staff_push_outbox (booking_id, staff_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_push_outbox_pending_idx ON staff_push_outbox (delivered_at, next_attempt_at, expires_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_push_deliveries (id TEXT PRIMARY KEY NOT NULL, outbox_id TEXT NOT NULL, subscription_id TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, delivered_at TEXT, last_error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (outbox_id) REFERENCES staff_push_outbox(id) ON DELETE CASCADE, FOREIGN KEY (subscription_id) REFERENCES staff_push_subscriptions(id) ON DELETE CASCADE)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS staff_push_deliveries_outbox_subscription_unique ON staff_push_deliveries (outbox_id, subscription_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_push_deliveries_pending_idx ON staff_push_deliveries (outbox_id, delivered_at, next_attempt_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_passkeys (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, credential_id TEXT NOT NULL UNIQUE, public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0, transports TEXT NOT NULL DEFAULT '[]', device_type TEXT NOT NULL DEFAULT 'singleDevice', backed_up INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_used_at TEXT, FOREIGN KEY (account_id) REFERENCES staff_accounts(id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_passkeys_account_idx ON staff_passkeys (account_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS staff_passkey_challenges (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, challenge TEXT NOT NULL, purpose TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (account_id) REFERENCES staff_accounts(id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS staff_passkey_challenges_lookup_idx ON staff_passkey_challenges (account_id, purpose, expires_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS app_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS api_rate_limits (bucket_key TEXT PRIMARY KEY NOT NULL, window_started_at INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL)"),
  ]);
  const staffColumns = await db.prepare("PRAGMA table_info(staff_members)").all<{ name: string }>();
  if (!staffColumns.results.some((column) => column.name === "whatsapp_phone")) {
    await db.prepare("ALTER TABLE staff_members ADD COLUMN whatsapp_phone TEXT").run();
  }
  if (!staffColumns.results.some((column) => column.name === "status_started_at")) {
    await db.prepare("ALTER TABLE staff_members ADD COLUMN status_started_at TEXT").run();
  }
  if (!staffColumns.results.some((column) => column.name === "weekly_off_day")) {
    await db.prepare("ALTER TABLE staff_members ADD COLUMN weekly_off_day INTEGER").run();
  }
  if (!staffColumns.results.some((column) => column.name === "profile_name")) {
    await db.prepare("ALTER TABLE staff_members ADD COLUMN profile_name TEXT").run();
  }
  if (!staffColumns.results.some((column) => column.name === "profile_image_key")) {
    await db.prepare("ALTER TABLE staff_members ADD COLUMN profile_image_key TEXT").run();
  }
  if (!staffColumns.results.some((column) => column.name === "profile_image_updated_at")) {
    await db.prepare("ALTER TABLE staff_members ADD COLUMN profile_image_updated_at TEXT").run();
  }
  const bookingGroupColumns = await db.prepare("PRAGMA table_info(booking_groups)").all<{ name: string }>();
  if (!bookingGroupColumns.results.some((column) => column.name === "full_name")) {
    await db.prepare("ALTER TABLE booking_groups ADD COLUMN full_name TEXT").run();
    await db.prepare("UPDATE booking_groups SET full_name = TRIM(first_name || ' ' || last_name) WHERE full_name IS NULL OR full_name = ''").run();
  }
  const bookingItemColumns = await db.prepare("PRAGMA table_info(booking_items)").all<{ name: string }>();
  if (!bookingItemColumns.results.some((column) => column.name === "updated_at")) {
    await db.prepare("ALTER TABLE booking_items ADD COLUMN updated_at TEXT").run();
    await db.prepare("UPDATE booking_items SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)").run();
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
  if (seededDate === today) return;
  const statements = [
    db.prepare("UPDATE staff_members SET status = 'available', status_date = NULL, status_started_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE status IN ('off_today', 'break') AND status_date IS NOT NULL AND status_date <> ?").bind(today),
    db.prepare("UPDATE service_entries SET status = 'available', status_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE status = 'off_today' AND status_date IS NOT NULL AND status_date <> ?").bind(today),
    ...bookingStaff.map((member, index) =>
      db.prepare("INSERT INTO staff_members (id, name, role_ar, role_en, specialty, status, sort_order) VALUES (?, ?, ?, ?, ?, 'available', ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, role_ar = excluded.role_ar, role_en = excluded.role_en, specialty = excluded.specialty, sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP")
        .bind(member.id, member.name, member.role.ar, member.role.en, member.specialty, index),
    ),
    ...bookingServices.map((service, index) =>
      db.prepare("INSERT INTO service_entries (id, category_id, name_ar, name_en, duration_minutes, price_ar, price_en, specialty, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?) ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, name_ar = excluded.name_ar, name_en = excluded.name_en, duration_minutes = excluded.duration_minutes, price_ar = excluded.price_ar, price_en = excluded.price_en, specialty = excluded.specialty, sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP")
        .bind(service.id, service.categoryId, service.name.ar, service.name.en, service.durationMinutes, service.price.ar, service.price.en, service.specialty, index),
    ),
    db.prepare("INSERT INTO staff_members (id, name, role_ar, role_en, specialty, status, sort_order) VALUES ('reception', 'موظف الاستقبال', 'موظف الاستقبال', 'Reception', 'operations', 'available', 900) ON CONFLICT(id) DO UPDATE SET name = excluded.name, role_ar = excluded.role_ar, role_en = excluded.role_en, specialty = excluded.specialty, sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP"),
    ...bookingStaff.flatMap((member) => {
      const defaults = staffOperationalDefaults[member.id] ?? {
        startMinute: BOOKING_RULES.openingMinutes,
        endMinute: BOOKING_RULES.closingMinutes,
      };
      return Array.from({ length: 7 }, (_, weekday) =>
        db.prepare("INSERT INTO staff_schedules (id, staff_id, weekday, start_minute, end_minute, active) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(staff_id, weekday) DO NOTHING")
          .bind(`${member.id}-${weekday}`, member.id, weekday, defaults.startMinute, defaults.endMinute),
      );
    }),
  ];
  await db.batch(statements);

  const operationsApplied = await db.prepare("SELECT id FROM app_migrations WHERE id = ?")
    .bind(STAFF_OPERATIONS_MIGRATION).first<{ id: string }>();
  if (!operationsApplied) {
    const operationStatements = bookingStaff.flatMap((member) => {
      const defaults = staffOperationalDefaults[member.id];
      if (!defaults) return [];
      const scheduleStatements = Array.from({ length: 7 }, (_, weekday) =>
        db.prepare(`
          INSERT INTO staff_schedules (id, staff_id, weekday, start_minute, end_minute, active)
          VALUES (?, ?, ?, ?, ?, 1)
          ON CONFLICT(staff_id, weekday) DO UPDATE SET
            start_minute = excluded.start_minute,
            end_minute = excluded.end_minute,
            active = 1,
            updated_at = CURRENT_TIMESTAMP
        `).bind(`${member.id}-${weekday}`, member.id, weekday, defaults.startMinute, defaults.endMinute),
      );
      if (defaults.whatsappPhone) {
        scheduleStatements.push(
          db.prepare("UPDATE staff_members SET whatsapp_phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(defaults.whatsappPhone, member.id),
        );
      }
      return scheduleStatements;
    });
    operationStatements.push(
      db.prepare("INSERT OR IGNORE INTO app_migrations (id) VALUES (?)").bind(STAFF_OPERATIONS_MIGRATION),
      db.prepare("INSERT INTO system_events (type, payload) VALUES ('staff.operations_seeded', ?)")
        .bind(JSON.stringify({ migration: STAFF_OPERATIONS_MIGRATION })),
    );
    await db.batch(operationStatements);
  }
  seededDate = today;
}

export async function getPublicCatalog() {
  await ensureCatalogSeed();
  const db = getD1();
  const now = ammanDateParts();
  const [staffResult, servicesResult] = await db.batch([
    db.prepare("SELECT id, status, status_date, status_started_at, weekly_off_day FROM staff_members WHERE specialty <> 'operations' ORDER BY sort_order"),
    db.prepare("SELECT id, status, status_date FROM service_entries ORDER BY sort_order"),
  ]);
  const staffStatus = new Map((staffResult.results as StatusRow[]).map((row) => [row.id, row]));
  const serviceStatus = new Map((servicesResult.results as StatusRow[]).map((row) => [row.id, row]));
  return {
    rules: BOOKING_RULES,
    staff: bookingStaff.map((member) => ({
      ...member,
      ...(staffStatus.get(member.id) ?? { status: "available", status_date: null }),
      breakNow: staffStatus.get(member.id)?.status === "break" && staffStatus.get(member.id)?.status_date === now.date,
    })),
    services: bookingServices.map((service) => ({ ...service, ...(serviceStatus.get(service.id) ?? { status: "available", status_date: null }) })),
  };
}

function statusAllowsDate(row: StatusRow | undefined, date: string) {
  if (!row || row.status === "available") return true;
  if (row.status === "disabled") return false;
  return row.status_date !== date;
}

export function weekdayFromDate(date: string) {
  return new Date(`${date}T12:00:00+03:00`).getUTCDay();
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
    ? db.prepare("SELECT bi.staff_id, bi.start_minute, bi.end_minute FROM booking_items bi JOIN booking_groups bg ON bg.id = bi.booking_id WHERE bi.booking_date = ? AND bi.status IN ('confirmed','arrived','in_service') AND bg.status NOT IN ('cancelled','no_show') AND bi.booking_id <> ?").bind(date, excludeBookingId)
    : db.prepare("SELECT bi.staff_id, bi.start_minute, bi.end_minute FROM booking_items bi JOIN booking_groups bg ON bg.id = bi.booking_id WHERE bi.booking_date = ? AND bi.status IN ('confirmed','arrived','in_service') AND bg.status NOT IN ('cancelled','no_show')").bind(date);
  const weekday = weekdayFromDate(date);
  const [staffResult, servicesResult, busyResult, breaksResult, schedulesResult] = await db.batch([
    db.prepare("SELECT id, status, status_date, status_started_at, weekly_off_day FROM staff_members"),
    db.prepare("SELECT id, status, status_date FROM service_entries"),
    busyQuery,
    db.prepare("SELECT staff_id, start_minute, end_minute FROM staff_breaks WHERE break_date = ? AND status = 'active'").bind(date),
    db.prepare("SELECT staff_id, weekday, start_minute, end_minute, active FROM staff_schedules WHERE weekday = ?").bind(weekday),
  ]);
  const scheduleMap = new Map((schedulesResult.results as ScheduleRow[]).map((row) => [row.staff_id, row]));
  return {
    weekday,
    staffStatus: new Map((staffResult.results as StatusRow[]).map((row) => [row.id, row])),
    serviceStatus: new Map((servicesResult.results as StatusRow[]).map((row) => [row.id, row])),
    busy: busyResult.results as BusyRow[],
    breaks: breaksResult.results as BreakRow[],
    staffSchedule: scheduleMap,
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
    const resources = service.resources ?? [{ specialty: service.specialty, durationMinutes: service.durationMinutes, label: { ar: service.name.ar, en: service.name.en } }];
    for (const resource of resources) {
      const eligible = bookingStaff.filter((member) => {
        if (member.specialty !== resource.specialty) return false;
        if (!statusAllowsDate(context.staffStatus.get(member.id), date)) return false;
        if (resource.specialty !== service.specialty) return true;
        return guest.staffId === "any" || guest.staffId === member.id;
      });
      if (!eligible.length) return null;

      const candidates = eligible.flatMap((member) => {
        const earlierForStaff = assigned.filter((item) => item.staffId === member.id);
        const desiredStart = earlierForStaff.length
          ? Math.max(...earlierForStaff.map((item) => item.endMinute + BOOKING_RULES.internalBufferMinutes))
          : groupStart;
        const desiredEnd = desiredStart + resource.durationMinutes;
        const status = context.staffStatus.get(member.id);
        if (status?.weekly_off_day === context.weekday) return [];
        const schedule = context.staffSchedule.get(member.id);
        const shiftStart = schedule?.active === 0 ? Number.POSITIVE_INFINITY : schedule?.start_minute ?? BOOKING_RULES.openingMinutes;
        const shiftEnd = schedule?.active === 0 ? Number.NEGATIVE_INFINITY : schedule?.end_minute ?? BOOKING_RULES.closingMinutes;
        if (desiredStart < shiftStart || desiredEnd > shiftEnd) return [];
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
        label: guest.label?.trim().slice(0, 80) || `${guestIndex + 1}`,
        resourceLabel: resource.label.ar,
      };
      assigned.push(item);
      timelines.get(selected.member.id)?.push({ start: selected.start, end: selected.end });
    }
  }
  return assigned;
}

export async function assignAtStart(date: string, groupStart: number, guests: GuestSelection[], excludeBookingId?: string): Promise<AssignedGuest[] | null> {
  if (!dateWithinBookingWindow(date) || !Number.isInteger(groupStart) || guests.length < 1 || guests.length > 6) return null;
  const now = ammanDateParts();
  const minimum = date === now.date
    ? Math.ceil((now.minutes + BOOKING_RULES.leadMinutes) / BOOKING_RULES.slotMinutes) * BOOKING_RULES.slotMinutes
    : BOOKING_RULES.openingMinutes;
  const startInterval = guests.reduce<number>((interval, guest) => Math.max(interval, getService(guest.serviceId)?.startIntervalMinutes ?? BOOKING_RULES.slotMinutes), BOOKING_RULES.slotMinutes);
  if (groupStart < Math.max(BOOKING_RULES.openingMinutes, minimum)
    || groupStart > BOOKING_RULES.latestStartMinutes
    || groupStart % BOOKING_RULES.slotMinutes !== 0
    || groupStart % startInterval !== 0) return null;
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
  const startInterval = guests.reduce<number>((interval, guest) => Math.max(interval, getService(guest.serviceId)?.startIntervalMinutes ?? BOOKING_RULES.slotMinutes), BOOKING_RULES.slotMinutes);
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

function scheduleClaimStatements(db: D1Database, date: string, assignments: Array<AssignedGuest & { itemId: string }>) {
  return assignments.flatMap((item) => {
    const statements: D1PreparedStatement[] = [];
    for (let minute = item.startMinute; minute < item.endMinute + BOOKING_RULES.internalBufferMinutes; minute += 5) {
      statements.push(
        db.prepare("INSERT INTO staff_time_claims (slot_key, owner_type, owner_id, staff_id, claim_date, minute) VALUES (?, 'booking_item', ?, ?, ?, ?)")
          .bind(`${item.staffId}:${date}:${minute}`, item.itemId, item.staffId, date, minute),
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

export async function assertPublicRateLimit(request: Request, scope: string, identifier: string, limit: number, windowMs: number) {
  await ensureBookingSchema();
  const db = getD1();
  const now = Date.now();
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown";
  const bucketKey = await sha256(`${scope}:${ip}:${identifier.slice(0, 120)}`);
  await db.prepare("DELETE FROM api_rate_limits WHERE expires_at < ?").bind(now).run();
  const row = await db.prepare(`
    INSERT INTO api_rate_limits (bucket_key, window_started_at, count, expires_at) VALUES (?, ?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET
      count = CASE WHEN api_rate_limits.window_started_at < ? THEN 1 ELSE api_rate_limits.count + 1 END,
      window_started_at = CASE WHEN api_rate_limits.window_started_at < ? THEN excluded.window_started_at ELSE api_rate_limits.window_started_at END,
      expires_at = excluded.expires_at
    RETURNING count
  `).bind(bucketKey, now, now + windowMs, now - windowMs, now - windowMs).first<{ count: number }>();
  if ((row?.count ?? limit + 1) > limit) throw new Error("PUBLIC_RATE_LIMITED");
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
  const random = new Uint32Array(1);
  const unbiasedLimit = Math.floor(0x1_0000_0000 / 900_000) * 900_000;
  do crypto.getRandomValues(random); while (random[0] >= unbiasedLimit);
  const code = String(100_000 + (random[0] % 900_000));
  const codeHash = await sha256(`${id}:${code}`);
  const expiresAt = Date.now() + 5 * 60_000;
  await db.prepare("INSERT INTO otp_challenges (id, phone, purpose, booking_id, code_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, phone, purpose, bookingId ?? null, codeHash, expiresAt).run();
  const delivery = await sendAuthenticationTemplate(phone, code);
  if (!delivery.delivered) {
    const demoEnabled = runtimeEnv().WHATSAPP_DEMO_OTP === "true";
    if (!demoEnabled) {
      await db.prepare("DELETE FROM otp_challenges WHERE id = ?").bind(id).run();
      throw new Error(delivery.configured ? "WHATSAPP_DELIVERY_FAILED" : "WHATSAPP_NOT_CONFIGURED");
    }
  }
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
  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!firstName || !lastName || fullName.split(/\s+/).filter(Boolean).length < 4) throw new Error("NAME_REQUIRED");
  if (!input.guests.length || input.guests.length > 6) throw new Error("GUESTS_REQUIRED");
  const challenge = await verifyOtp(input.challengeId, input.code, "booking");
  const phone = normalizePhone(input.phone);
  if (phone !== challenge.phone) throw new Error("PHONE_MISMATCH");
  const assignments = await assignAtStart(input.date, input.startMinute, input.guests);
  if (!assignments) throw new Error("SLOT_UNAVAILABLE");

  const db = getD1();
  const id = crypto.randomUUID();
  const manageToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const compactDate = input.date.replaceAll("-", "").slice(2);
  const bookingCodeRandom = new Uint32Array(1);
  crypto.getRandomValues(bookingCodeRandom);
  const bookingCode = `MJ-${compactDate}-${String(100000 + (bookingCodeRandom[0] % 900000))}`;
  const staffIds = [...new Set(assignments.map((item) => item.staffId))];
  const pushRecipients = [...new Set(["mustafa", "reception", ...staffIds])];
  const appointmentSummary = assignments.map((item) => {
    const service = getService(item.serviceId)?.name.ar ?? item.serviceId;
    const hour = `${String(Math.floor(item.startMinute / 60)).padStart(2, "0")}:${String(item.startMinute % 60).padStart(2, "0")}`;
    return `${service} · ${hour}`;
  }).join("، ").slice(0, 220);
  const pushPayload = JSON.stringify({
    title: "حجز جديد · MJ",
    body: `${fullName} · ${input.date}\n${appointmentSummary}`,
    tag: `booking-${bookingCode}`,
    url: "/staff?tab=upcoming",
    bookingId: id,
  });
  const pushExpiresAt = Date.now() + 24 * 60 * 60_000;
  const assignmentRows = assignments.map((item) => ({ ...item, itemId: crypto.randomUUID() }));
  const statements = [
    db.prepare("UPDATE otp_challenges SET verified_at = ? WHERE id = ? AND verified_at IS NULL").bind(Date.now(), challenge.id),
    db.prepare("INSERT INTO otp_redemptions (challenge_id, booking_id) VALUES (?, ?)").bind(challenge.id, id),
    db.prepare("INSERT INTO booking_groups (id, booking_code, first_name, last_name, full_name, phone, locale, status, manage_token) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)")
      .bind(id, bookingCode, firstName, lastName, fullName, phone, input.locale, manageToken),
    ...assignmentRows.map((item) =>
      db.prepare("INSERT INTO booking_items (id, booking_id, guest_index, guest_label, service_id, staff_id, booking_date, start_minute, end_minute, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', CURRENT_TIMESTAMP)")
        .bind(item.itemId, id, item.guestIndex, item.resourceLabel ? `${item.label} · ${item.resourceLabel}` : item.label, item.serviceId, item.staffId, input.date, item.startMinute, item.endMinute),
    ),
    ...scheduleClaimStatements(db, input.date, assignmentRows),
    ...pushRecipients.map((staffId) => db.prepare("INSERT OR IGNORE INTO staff_push_outbox (id, booking_id, staff_id, payload, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), id, staffId, pushPayload, pushExpiresAt)),
    db.prepare("INSERT INTO system_events (type, payload) VALUES ('booking.created', ?)").bind(JSON.stringify({ bookingId: id, staffIds: assignments.map((item) => item.staffId), date: input.date })),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("otp_redemptions")) throw new Error("OTP_ALREADY_USED");
    if (message.includes("staff_time_claims") || message.includes("UNIQUE constraint")) throw new Error("SLOT_UNAVAILABLE");
    throw error;
  }
  const summary = bookingSummaryText({ bookingCode, firstName, lastName, phone, date: input.date, assignments, locale: input.locale });
  const staffPlaceholders = staffIds.map(() => "?").join(",");
  const staffPhones = staffIds.length
    ? await db.prepare(`SELECT whatsapp_phone FROM staff_members WHERE id IN (${staffPlaceholders}) AND whatsapp_phone IS NOT NULL AND whatsapp_phone <> ''`).bind(...staffIds).all<{ whatsapp_phone: string }>()
    : { results: [] as Array<{ whatsapp_phone: string }> };
  waitUntil(Promise.allSettled([
    sendBookingNotifications({
      phone,
      ownerPhone: MUSTAFA_WHATSAPP,
      staffPhones: staffPhones.results.map((row) => normalizePhone(row.whatsapp_phone)),
      summary,
    }),
    deliverStaffPushOutboxWithRetry(id),
  ]));
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
  if (!token || !phoneNumberId || !template) return { configured: false, delivered: false };
  try {
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
    return { configured: true, delivered: response.ok };
  } catch {
    return { configured: true, delivered: false };
  }
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
  const status = ["INVALID_PHONE", "NAME_REQUIRED", "GUESTS_REQUIRED", "INVALID_USERNAME", "WEAK_PASSWORD", "USERNAME_TAKEN", "STAFF_NOT_FOUND", "INVALID_PUSH_SUBSCRIPTION", "PUSH_ENDPOINT_REQUIRED"].includes(message) ? 400
    : ["OTP_INVALID", "OTP_EXPIRED", "OTP_LOCKED", "OTP_ALREADY_USED"].includes(message) ? 401
      : ["OTP_RATE_LIMITED", "PUBLIC_RATE_LIMITED"].includes(message) ? 429
        : ["WHATSAPP_NOT_CONFIGURED", "WHATSAPP_DELIVERY_FAILED"].includes(message) ? 503
      : ["STAFF_UNAUTHORIZED", "STAFF_BAD_ORIGIN", "STAFF_CREDENTIAL_CHANGE_REQUIRED"].includes(message) ? 403
      : message === "PASSKEY_NOT_REGISTERED" ? 404
      : ["PASSKEY_CHALLENGE_EXPIRED", "PASSKEY_VERIFICATION_FAILED"].includes(message) ? 401
      : message === "PASSKEY_ALREADY_REGISTERED" ? 409
      : ["SLOT_UNAVAILABLE"].includes(message) ? 409
        : message === "BOOKING_NOT_FOUND" ? 404 : 500;
  return Response.json({ error: message }, { status });
}
