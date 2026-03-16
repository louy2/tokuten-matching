CREATE TABLE `readiness_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`party_id` text NOT NULL,
	`initiated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `readiness_responses` (
	`check_id` text NOT NULL,
	`user_id` text NOT NULL,
	`still_in` integer NOT NULL,
	`responded_at` integer NOT NULL,
	PRIMARY KEY(`check_id`, `user_id`),
	FOREIGN KEY (`check_id`) REFERENCES `readiness_checks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `parties` ADD `mituori_board_claimed_by` text REFERENCES users(id);