import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { env } from "cloudflare:workers";
import { shiftIsoDate } from "../lib/date-utils.ts";
import { pendingPushSubscriptionsSql } from "../lib/push-server.ts";

const root = new URL("../", import.meta.url);

class TestD1Statement {
  constructor(owner, sql, bindings = []) {
    this.owner = owner;
    this.database = owner.database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new TestD1Statement(this.owner, this.sql, bindings);
  }

  execute() {
    this.owner.record(this.bindings.length);
    const statement = this.database.prepare(this.sql);
    if (/\bRETURNING\b/i.test(this.sql) || /^\s*(SELECT|PRAGMA|WITH)\b/i.test(this.sql)) {
      return { results: statement.all(...this.bindings), success: true, meta: {} };
    }
    const result = statement.run(...this.bindings);
    return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }

  async all() {
    return this.execute();
  }

  async first() {
    this.owner.record(this.bindings.length);
    return this.database.prepare(this.sql).get(...this.bindings) ?? null;
  }

  async run() {
    return this.execute();
  }
}

class TestD1Database {
  constructor(database) {
    this.database = database;
    this.resetMetrics();
  }

  prepare(sql) {
    return new TestD1Statement(this, sql);
  }

  record(bindingCount) {
    this.queryCount += 1;
    this.maxBindings = Math.max(this.maxBindings, bindingCount);
  }

  resetMetrics() {
    this.queryCount = 0;
    this.maxBindings = 0;
    this.maxBatchSize = 0;
  }

  async batch(statements) {
    this.maxBatchSize = Math.max(this.maxBatchSize, statements.length);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.execute());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

async function migrate(database) {
  const directory = new URL("drizzle/", root);
  const files = (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  database.exec("PRAGMA foreign_keys = ON");
  for (const file of files) {
    const sql = await readFile(new URL(file, directory), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) database.exec(statement);
  }
}

test("booking confirmation is atomic and remains idempotent after OTP expiry", async () => {
  const sqlite = new DatabaseSync(":memory:");
  await migrate(sqlite);
  sqlite.exec("DELETE FROM app_migrations WHERE id = 'runtime-schema-2026-08-29-v1'");
  sqlite.exec("DROP INDEX booking_items_staff_booking_idx");
  sqlite.exec("DROP INDEX booking_items_date_idx");
  sqlite.exec("DROP INDEX booking_items_staff_date_idx");
  sqlite.exec("DROP INDEX booking_groups_phone_created_idx");
  const testDb = new TestD1Database(sqlite);
  env.DB = testDb;
  env.WHATSAPP_DEMO_OTP = "true";
  try {
    const booking = await import("../lib/booking-server.ts");
    const date = shiftIsoDate(booking.ammanDateParts().date, 1);
    const guests = [{ serviceId: "haircut", staffId: "any", label: "ضيف الاختبار" }];
    testDb.resetMetrics();
    const slots = await booking.findAvailability(date, guests);
    assert.ok(slots.length > 0);
    assert.ok(testDb.queryCount <= 50, `fresh catalog and availability used ${testDb.queryCount} D1 queries`);
    assert.ok(testDb.maxBatchSize <= 50, `fresh catalog batch contained ${testDb.maxBatchSize} statements`);
    assert.ok(testDb.maxBindings <= 100, `fresh catalog query used ${testDb.maxBindings} bindings`);
    assert.ok(sqlite.prepare("SELECT id FROM app_migrations WHERE id = 'runtime-schema-2026-08-29-v1'").get());
    assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'booking_items_date_idx'").get());

    const challenge = await booking.createOtp("0790000003", "booking");
    assert.ok(challenge.devCode);
    const input = {
      challengeId: challenge.id,
      code: challenge.devCode,
      firstName: "أحمد محمد علي",
      lastName: "محمود",
      phone: "0790000003",
      locale: "ar",
      date,
      startMinute: slots[0].startMinute,
      guests,
    };
    const first = await booking.createBooking(input);
    sqlite.prepare("UPDATE otp_challenges SET expires_at = 0 WHERE id = ?").run(challenge.id);
    const repeated = await booking.createBooking(input);

    assert.equal(repeated.bookingId, first.bookingId);
    assert.equal(repeated.bookingCode, first.bookingCode);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM booking_groups").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM otp_redemptions").get().count, 1);
    assert.deepEqual(await booking.findAvailability("2026-09-31", guests), []);

    const groupDate = shiftIsoDate(date, 1);
    const groupGuests = Array.from({ length: 6 }, (_, index) => ({ serviceId: "package-groom", staffId: "any", label: `ضيف ${index + 1}` }));
    const groupSlots = await booking.findAvailability(groupDate, groupGuests);
    assert.ok(groupSlots.length > 0);
    const groupChallenge = await booking.createOtp("0790000004", "booking");
    assert.ok(groupChallenge.devCode);
    testDb.resetMetrics();
    const groupBooking = await booking.createBooking({
      challengeId: groupChallenge.id,
      code: groupChallenge.devCode,
      firstName: "أحمد محمد علي",
      lastName: "محمود",
      phone: "0790000004",
      locale: "ar",
      date: groupDate,
      startMinute: groupSlots[0].startMinute,
      guests: groupGuests,
    });
    assert.equal(groupBooking.assignments.length, 18);
    assert.ok(testDb.queryCount <= 50, `largest booking used ${testDb.queryCount} D1 queries`);
    assert.ok(testDb.maxBatchSize <= 50, `largest booking batch contained ${testDb.maxBatchSize} statements`);
    assert.ok(testDb.maxBindings <= 100, `largest booking query used ${testDb.maxBindings} bindings`);

    const breakDate = shiftIsoDate(groupDate, 1);
    const fullDayClaims = [];
    for (let minute = 12 * 60; minute < 23 * 60; minute += 5) {
      fullDayClaims.push({ ownerId: "full-day-break", staffId: "bahaa", date: breakDate, minute });
    }
    const breakStatements = booking.staffTimeClaimStatements(testDb, "break", fullDayClaims);
    testDb.resetMetrics();
    await testDb.batch(breakStatements);
    assert.ok(breakStatements.length <= 7, `full-day break required ${breakStatements.length} statements`);
    assert.ok(testDb.maxBindings <= 100, `full-day break query used ${testDb.maxBindings} bindings`);

    const outbox = sqlite.prepare("SELECT id, staff_id FROM staff_push_outbox WHERE booking_id = ? ORDER BY staff_id LIMIT 1").get(first.bookingId);
    assert.ok(outbox?.id && outbox?.staff_id);
    const pushStaffId = outbox.staff_id;
    let account = sqlite.prepare("SELECT id FROM staff_accounts WHERE staff_id = ?").get(pushStaffId);
    if (!account) {
      sqlite.prepare(`
        INSERT INTO staff_accounts (id, staff_id, username, password_salt, password_hash)
        VALUES ('push-test-account', ?, 'push-test-user', 'salt', 'hash')
      `).run(pushStaffId);
      account = { id: "push-test-account" };
    }
    const pushNow = Date.now();
    const insertSubscription = sqlite.prepare(`
      INSERT INTO staff_push_subscriptions
        (id, account_id, endpoint, p256dh, auth, expires_at, updated_at)
      VALUES (?, ?, ?, 'test-key', 'test-auth', ?, ?)
    `);
    for (let index = 1; index <= 5; index += 1) {
      const updatedAt = index <= 2 ? `2030-01-01 00:00:0${index}` : `2020-01-01 00:00:0${index}`;
      insertSubscription.run(`push-${index}`, account.id, `https://push.example/${index}`, pushNow + 60_000, updatedAt);
    }
    const insertFailure = sqlite.prepare(`
      INSERT INTO staff_push_deliveries
        (id, outbox_id, subscription_id, attempts, next_attempt_at, delivered_at, last_error)
      VALUES (?, ?, ?, 1, ?, NULL, 'DELIVERY_RETRY')
    `);
    insertFailure.run("delivery-1", outbox.id, "push-1", pushNow + 60_000);
    insertFailure.run("delivery-2", outbox.id, "push-2", pushNow + 60_000);
    const pendingPushes = () => sqlite.prepare(pendingPushSubscriptionsSql())
      .all(outbox.id, pushStaffId, pushNow, pushNow).map((row) => row.id);
    assert.deepEqual(pendingPushes(), ["push-5", "push-4"], "untried devices must outrank newer failed devices");
    sqlite.prepare(`
      INSERT INTO staff_push_deliveries
        (id, outbox_id, subscription_id, attempts, next_attempt_at, delivered_at)
      VALUES (?, ?, ?, 1, 0, CURRENT_TIMESTAMP)
    `).run("delivery-5", outbox.id, "push-5");
    sqlite.prepare(`
      INSERT INTO staff_push_deliveries
        (id, outbox_id, subscription_id, attempts, next_attempt_at, delivered_at)
      VALUES (?, ?, ?, 1, 0, CURRENT_TIMESTAMP)
    `).run("delivery-4", outbox.id, "push-4");
    assert.deepEqual(pendingPushes(), ["push-3"], "the last untried device must run before deferred retries");
    sqlite.prepare("UPDATE staff_push_deliveries SET next_attempt_at = ? WHERE subscription_id IN ('push-1', 'push-2')")
      .run(pushNow - 1);
    assert.deepEqual(pendingPushes(), ["push-3", "push-2"], "due retries may share a later batch without starving the final new device");
    sqlite.prepare(`
      INSERT INTO staff_push_deliveries
        (id, outbox_id, subscription_id, attempts, next_attempt_at, delivered_at)
      VALUES (?, ?, 'push-3', 1, 0, CURRENT_TIMESTAMP)
    `).run("delivery-3", outbox.id);
    assert.deepEqual(pendingPushes(), ["push-2", "push-1"], "delivered devices must not be selected again");
  } finally {
    delete env.DB;
    delete env.WHATSAPP_DEMO_OTP;
    sqlite.close();
  }
});
