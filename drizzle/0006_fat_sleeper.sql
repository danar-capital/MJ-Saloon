-- This migration is intentionally adoption-safe. The existing MJ database
-- already received these columns and tables through the original runtime
-- bootstrap, while a brand-new database receives the columns from 0000.
-- Every statement below can therefore run safely in either environment.
UPDATE `booking_groups`
SET `full_name` = TRIM(`first_name` || ' ' || `last_name`)
WHERE `full_name` IS NULL OR `full_name` = '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `booking_items_schedule_idx` ON `booking_items` (`staff_id`,`booking_date`,`start_minute`,`end_minute`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `booking_items_booking_idx` ON `booking_items` (`booking_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `booking_items_staff_booking_idx` ON `booking_items` (`staff_id`,`booking_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `booking_items_date_idx` ON `booking_items` (`booking_date`,`start_minute`,`booking_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `booking_items_staff_date_idx` ON `booking_items` (`staff_id`,`booking_date`,`start_minute`,`booking_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `booking_groups_phone_created_idx` ON `booking_groups` (`phone`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `staff_schedules_staff_day_unique` ON `staff_schedules` (`staff_id`,`weekday`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `staff_schedules_day_idx` ON `staff_schedules` (`weekday`,`staff_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `system_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`actor_id` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `system_events_created_idx` ON `system_events` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text DEFAULT '[]' NOT NULL,
	`device_type` text DEFAULT 'singleDevice' NOT NULL,
	`backed_up` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `staff_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `staff_passkeys_credential_unique` ON `staff_passkeys` (`credential_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `staff_passkeys_account_idx` ON `staff_passkeys` (`account_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_passkey_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`challenge` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `staff_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `staff_passkey_challenges_lookup_idx` ON `staff_passkey_challenges` (`account_id`,`purpose`,`expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `app_migrations` (
	`id` text PRIMARY KEY NOT NULL,
	`applied_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `app_migrations` (`id`) VALUES ('runtime-schema-2026-08-29-v1');
