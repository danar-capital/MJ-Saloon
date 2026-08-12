import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const staffMembers = sqliteTable("staff_members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  roleAr: text("role_ar").notNull(),
  roleEn: text("role_en").notNull(),
  specialty: text("specialty").notNull(),
  status: text("status").notNull().default("available"),
  statusDate: text("status_date"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const serviceEntries = sqliteTable("service_entries", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  priceAr: text("price_ar").notNull(),
  priceEn: text("price_en").notNull(),
  specialty: text("specialty").notNull(),
  status: text("status").notNull().default("available"),
  statusDate: text("status_date"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const bookingGroups = sqliteTable("booking_groups", {
  id: text("id").primaryKey(),
  bookingCode: text("booking_code").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  locale: text("locale").notNull().default("ar"),
  status: text("status").notNull().default("confirmed"),
  manageToken: text("manage_token").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("booking_groups_code_unique").on(table.bookingCode),
  uniqueIndex("booking_groups_manage_token_unique").on(table.manageToken),
  index("booking_groups_phone_idx").on(table.phone),
]);

export const bookingItems = sqliteTable("booking_items", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull().references(() => bookingGroups.id),
  guestIndex: integer("guest_index").notNull(),
  guestLabel: text("guest_label").notNull(),
  serviceId: text("service_id").notNull(),
  staffId: text("staff_id").notNull(),
  bookingDate: text("booking_date").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  status: text("status").notNull().default("confirmed"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("booking_items_schedule_idx").on(table.staffId, table.bookingDate, table.startMinute, table.endMinute),
  index("booking_items_booking_idx").on(table.bookingId),
]);

export const scheduleLocks = sqliteTable("schedule_locks", {
  slotKey: text("slot_key").primaryKey(),
  bookingId: text("booking_id").notNull().references(() => bookingGroups.id),
  staffId: text("staff_id").notNull(),
  bookingDate: text("booking_date").notNull(),
  minute: integer("minute").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("schedule_locks_booking_idx").on(table.bookingId)]);

export const otpChallenges = sqliteTable("otp_challenges", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  purpose: text("purpose").notNull(),
  bookingId: text("booking_id"),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  verifiedAt: integer("verified_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("otp_challenges_phone_idx").on(table.phone, table.createdAt)]);

export const manageSessions = sqliteTable("manage_sessions", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull().references(() => bookingGroups.id),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("manage_sessions_booking_idx").on(table.bookingId)]);

export const changeRequests = sqliteTable("change_requests", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull().references(() => bookingGroups.id),
  type: text("type").notNull(),
  requestedDate: text("requested_date"),
  requestedStartMinute: integer("requested_start_minute"),
  payload: text("payload").notNull().default("{}"),
  status: text("status").notNull().default("pending"),
  decisionNote: text("decision_note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  decidedAt: text("decided_at"),
}, (table) => [
  index("change_requests_booking_idx").on(table.bookingId),
  index("change_requests_status_idx").on(table.status, table.createdAt),
]);
