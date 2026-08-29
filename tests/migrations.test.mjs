import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

function executeMigration(database, sql) {
  for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
    database.exec(statement);
  }
}

test("all migrations build the production schema from an empty database", async () => {
  const migrationDirectory = new URL("drizzle/", root);
  const files = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  try {
    for (const file of files) {
      const sql = await readFile(new URL(file, migrationDirectory), "utf8");
      executeMigration(database, sql);
    }

    const schema = await readFile(new URL("db/schema.ts", root), "utf8");
    const bookingServer = await readFile(new URL("lib/booking-server.ts", root), "utf8");
    const expectedTables = [...schema.matchAll(/sqliteTable\("([^"]+)"/g)].map((match) => match[1]).sort();
    const actualTables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all().map((row) => row.name);
    assert.deepEqual(actualTables, expectedTables);
    const guardBlock = bookingServer.match(/const REQUIRED_RUNTIME_TABLES = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
    const guardedTables = [...guardBlock.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]).sort();
    assert.deepEqual(guardedTables, expectedTables, "runtime adoption guard must verify every production table");

    const columns = (table) => new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
    assert.ok(columns("staff_members").has("profile_image_updated_at"));
    assert.ok(columns("staff_members").has("weekly_off_day"));
    assert.ok(columns("booking_groups").has("full_name"));
    const bookingItemColumns = columns("booking_items");
    assert.ok(bookingItemColumns.has("updated_at"));
    assert.equal(database.prepare("PRAGMA table_info(booking_items)").all().find((row) => row.name === "updated_at").notnull, 1);

    const indexes = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
    for (const index of [
      "booking_items_date_idx",
      "booking_items_staff_date_idx",
      "booking_groups_phone_created_idx",
      "staff_schedules_staff_day_unique",
      "staff_passkeys_credential_unique",
      "staff_passkey_challenges_lookup_idx",
    ]) assert.ok(indexes.has(index), `missing index ${index}`);

    assert.ok(database.prepare("SELECT id FROM app_migrations WHERE id = 'runtime-schema-2026-08-29-v1'").get());

    database.prepare(`
      INSERT INTO booking_groups
        (id, booking_code, first_name, last_name, phone, manage_token)
      VALUES ('adoption-test', 'MJ-ADOPTION', 'Adoption', 'Test', '962790000000', 'adoption-token')
    `).run();
    const adoptionMigration = await readFile(new URL("drizzle/0006_fat_sleeper.sql", root), "utf8");
    executeMigration(database, adoptionMigration);
    const adoptedBooking = database.prepare("SELECT full_name FROM booking_groups WHERE id = 'adoption-test'").get();
    assert.equal(adoptedBooking?.full_name, "Adoption Test", "adoption-safe migration must preserve and backfill an existing database");
  } finally {
    database.close();
  }
});
