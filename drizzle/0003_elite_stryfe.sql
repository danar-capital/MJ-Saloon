ALTER TABLE `staff_accounts` ADD `must_change_credentials` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`expires_at` integer NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`last_success_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `staff_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `staff_push_subscriptions_endpoint_unique` ON `staff_push_subscriptions` (`endpoint`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `staff_push_subscriptions_account_idx` ON `staff_push_subscriptions` (`account_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_push_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`delivered_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `booking_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `staff_push_outbox_booking_staff_unique` ON `staff_push_outbox` (`booking_id`,`staff_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `staff_push_outbox_pending_idx` ON `staff_push_outbox` (`delivered_at`,`next_attempt_at`,`expires_at`);
