CREATE TABLE `booking_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_code` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`full_name` text,
	`phone` text NOT NULL,
	`locale` text DEFAULT 'ar' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`manage_token` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_groups_code_unique` ON `booking_groups` (`booking_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_groups_manage_token_unique` ON `booking_groups` (`manage_token`);--> statement-breakpoint
CREATE INDEX `booking_groups_phone_idx` ON `booking_groups` (`phone`);--> statement-breakpoint
CREATE TABLE `booking_items` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`guest_index` integer NOT NULL,
	`guest_label` text NOT NULL,
	`service_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`booking_date` text NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `booking_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `booking_items_schedule_idx` ON `booking_items` (`staff_id`,`booking_date`,`start_minute`,`end_minute`);--> statement-breakpoint
CREATE INDEX `booking_items_booking_idx` ON `booking_items` (`booking_id`);--> statement-breakpoint
CREATE TABLE `change_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`type` text NOT NULL,
	`requested_date` text,
	`requested_start_minute` integer,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decision_note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`booking_id`) REFERENCES `booking_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `change_requests_booking_idx` ON `change_requests` (`booking_id`);--> statement-breakpoint
CREATE INDEX `change_requests_status_idx` ON `change_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `manage_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `booking_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `manage_sessions_booking_idx` ON `manage_sessions` (`booking_id`);--> statement-breakpoint
CREATE TABLE `otp_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`purpose` text NOT NULL,
	`booking_id` text,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`verified_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `otp_challenges_phone_idx` ON `otp_challenges` (`phone`,`created_at`);--> statement-breakpoint
CREATE TABLE `service_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`name_ar` text NOT NULL,
	`name_en` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`price_ar` text NOT NULL,
	`price_en` text NOT NULL,
	`specialty` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`status_date` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role_ar` text NOT NULL,
	`role_en` text NOT NULL,
	`specialty` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`status_date` text,
	`status_started_at` text,
	`weekly_off_day` integer,
	`profile_name` text,
	`profile_image_key` text,
	`profile_image_updated_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
