CREATE TABLE `otp_redemptions` (
	`challenge_id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`redeemed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `otp_redemptions_booking_unique` ON `otp_redemptions` (`booking_id`);--> statement-breakpoint
CREATE TABLE `staff_login_attempts` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`blocked_until` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_push_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`outbox_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`delivered_at` text,
	`last_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`outbox_id`) REFERENCES `staff_push_outbox`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `staff_push_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_push_deliveries_outbox_subscription_unique` ON `staff_push_deliveries` (`outbox_id`,`subscription_id`);--> statement-breakpoint
CREATE INDEX `staff_push_deliveries_pending_idx` ON `staff_push_deliveries` (`outbox_id`,`delivered_at`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `staff_time_claims` (
	`slot_key` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`claim_date` text NOT NULL,
	`minute` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `staff_time_claims_owner_idx` ON `staff_time_claims` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE INDEX `staff_time_claims_staff_date_idx` ON `staff_time_claims` (`staff_id`,`claim_date`,`minute`);