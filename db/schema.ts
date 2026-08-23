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
  statusStartedAt: text("status_started_at"),
  weeklyOffDay: integer("weekly_off_day"),
  whatsappPhone: text("whatsapp_phone"),
  profileName: text("profile_name"),
  profileImageKey: text("profile_image_key"),
  profileImageUpdatedAt: text("profile_image_updated_at"),
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
  fullName: text("full_name"),
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
  index("booking_groups_phone_created_idx").on(table.phone, table.createdAt),
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
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("booking_items_schedule_idx").on(table.staffId, table.bookingDate, table.startMinute, table.endMinute),
  index("booking_items_booking_idx").on(table.bookingId),
  index("booking_items_staff_booking_idx").on(table.staffId, table.bookingId),
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

export const otpRedemptions = sqliteTable("otp_redemptions", {
  challengeId: text("challenge_id").primaryKey(),
  bookingId: text("booking_id").notNull(),
  redeemedAt: text("redeemed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("otp_redemptions_booking_unique").on(table.bookingId)]);

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

export const staffBreaks = sqliteTable("staff_breaks", {
  id: text("id").primaryKey(),
  staffId: text("staff_id").notNull().references(() => staffMembers.id),
  breakDate: text("break_date").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  note: text("note"),
  status: text("status").notNull().default("active"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("staff_breaks_schedule_idx").on(table.staffId, table.breakDate, table.startMinute, table.endMinute)]);

export const staffTimeClaims = sqliteTable("staff_time_claims", {
  slotKey: text("slot_key").primaryKey(),
  ownerType: text("owner_type").notNull(),
  ownerId: text("owner_id").notNull(),
  staffId: text("staff_id").notNull().references(() => staffMembers.id),
  claimDate: text("claim_date").notNull(),
  minute: integer("minute").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("staff_time_claims_owner_idx").on(table.ownerType, table.ownerId),
  index("staff_time_claims_staff_date_idx").on(table.staffId, table.claimDate, table.minute),
]);

export const staffSchedules = sqliteTable("staff_schedules", {
  id: text("id").primaryKey(),
  staffId: text("staff_id").notNull().references(() => staffMembers.id),
  weekday: integer("weekday").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  active: integer("active").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("staff_schedules_staff_day_unique").on(table.staffId, table.weekday),
  index("staff_schedules_day_idx").on(table.weekday, table.staffId),
]);

export const systemEvents = sqliteTable("system_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  actorId: text("actor_id"),
  payload: text("payload").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("system_events_created_idx").on(table.createdAt)]);

export const staffAccounts = sqliteTable("staff_accounts", {
  id: text("id").primaryKey(),
  staffId: text("staff_id").notNull().references(() => staffMembers.id),
  username: text("username").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("staff"),
  active: integer("active").notNull().default(1),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until"),
  mustChangeCredentials: integer("must_change_credentials").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("staff_accounts_staff_unique").on(table.staffId),
  uniqueIndex("staff_accounts_username_unique").on(table.username),
]);

export const staffSessions = sqliteTable("staff_sessions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => staffAccounts.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("staff_sessions_token_unique").on(table.tokenHash)]);

export const staffLoginAttempts = sqliteTable("staff_login_attempts", {
  bucketKey: text("bucket_key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  blockedUntil: integer("blocked_until"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const staffPushSubscriptions = sqliteTable("staff_push_subscriptions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => staffAccounts.id),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  expiresAt: integer("expires_at").notNull(),
  failureCount: integer("failure_count").notNull().default(0),
  lastSuccessAt: text("last_success_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("staff_push_subscriptions_endpoint_unique").on(table.endpoint),
  index("staff_push_subscriptions_account_idx").on(table.accountId, table.updatedAt),
]);

export const staffPushOutbox = sqliteTable("staff_push_outbox", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull().references(() => bookingGroups.id),
  staffId: text("staff_id").notNull().references(() => staffMembers.id),
  payload: text("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
  deliveredAt: text("delivered_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("staff_push_outbox_booking_staff_unique").on(table.bookingId, table.staffId),
  index("staff_push_outbox_pending_idx").on(table.deliveredAt, table.nextAttemptAt, table.expiresAt),
]);

export const staffPushDeliveries = sqliteTable("staff_push_deliveries", {
  id: text("id").primaryKey(),
  outboxId: text("outbox_id").notNull().references(() => staffPushOutbox.id, { onDelete: "cascade" }),
  subscriptionId: text("subscription_id").notNull().references(() => staffPushSubscriptions.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at").notNull().default(0),
  deliveredAt: text("delivered_at"),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("staff_push_deliveries_outbox_subscription_unique").on(table.outboxId, table.subscriptionId),
  index("staff_push_deliveries_pending_idx").on(table.outboxId, table.deliveredAt, table.nextAttemptAt),
]);

export const staffPasskeys = sqliteTable("staff_passkeys", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => staffAccounts.id),
  credentialId: text("credential_id").notNull(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: text("transports").notNull().default("[]"),
  deviceType: text("device_type").notNull().default("singleDevice"),
  backedUp: integer("backed_up").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastUsedAt: text("last_used_at"),
}, (table) => [
  uniqueIndex("staff_passkeys_credential_unique").on(table.credentialId),
  index("staff_passkeys_account_idx").on(table.accountId, table.createdAt),
]);

export const staffPasskeyChallenges = sqliteTable("staff_passkey_challenges", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => staffAccounts.id),
  challenge: text("challenge").notNull(),
  purpose: text("purpose").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("staff_passkey_challenges_lookup_idx").on(table.accountId, table.purpose, table.expiresAt),
]);

export const appMigrations = sqliteTable("app_migrations", {
  id: text("id").primaryKey(),
  appliedAt: text("applied_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const apiRateLimits = sqliteTable("api_rate_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStartedAt: integer("window_started_at").notNull(),
  count: integer("count").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
});
