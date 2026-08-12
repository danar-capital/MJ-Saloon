CREATE TABLE `schedule_locks` (
	`slot_key` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`booking_date` text NOT NULL,
	`minute` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `booking_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `schedule_locks_booking_idx` ON `schedule_locks` (`booking_id`);