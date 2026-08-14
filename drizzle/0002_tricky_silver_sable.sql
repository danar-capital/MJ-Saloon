CREATE TABLE `staff_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`username` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_accounts_staff_unique` ON `staff_accounts` (`staff_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `staff_accounts_username_unique` ON `staff_accounts` (`username`);--> statement-breakpoint
CREATE TABLE `staff_breaks` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`break_date` text NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	`note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `staff_breaks_schedule_idx` ON `staff_breaks` (`staff_id`,`break_date`,`start_minute`,`end_minute`);--> statement-breakpoint
CREATE TABLE `staff_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `staff_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_sessions_token_unique` ON `staff_sessions` (`token_hash`);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `whatsapp_phone` text;