CREATE TABLE `character_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`party_id` text NOT NULL,
	`character_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`claim_type` text NOT NULL,
	`rank` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`party_id` text,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`undone_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_party` ON `events` (`party_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_events_user` ON `events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`leader_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`group_chat_link` text,
	`languages` text DEFAULT '["ja"]' NOT NULL,
	`auto_promote_date` text DEFAULT '2026-05-08',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`leader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `party_members` (
	`party_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`party_id`, `user_id`),
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`oauth_provider` text NOT NULL,
	`oauth_id` text NOT NULL,
	`languages` text DEFAULT '[]' NOT NULL,
	`payment_methods` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
