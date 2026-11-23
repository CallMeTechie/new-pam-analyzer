CREATE TABLE `connect_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`purpose` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`password_set_at` integer,
	`device_connected_at` integer,
	`revoked_at` integer,
	`created_by` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connect_codes_code_hash_unique` ON `connect_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `connect_codes_user_idx` ON `connect_codes` (`user_id`);--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`install_id` text NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`app_version` text,
	`token_hash` text NOT NULL,
	`upload_count` integer DEFAULT 0 NOT NULL,
	`last_seen_at` integer,
	`disconnected_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_devices`("id", "user_id", "install_id", "name", "platform", "app_version", "token_hash", "upload_count", "last_seen_at", "disconnected_at", "created_at") SELECT "id", "user_id", "install_id", "name", "platform", "app_version", "token_hash", "upload_count", "last_seen_at", "disconnected_at", "created_at" FROM `devices`;--> statement-breakpoint
DROP TABLE `devices`;--> statement-breakpoint
ALTER TABLE `__new_devices` RENAME TO `devices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_hash_unique` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `devices_user_idx` ON `devices` (`user_id`);--> statement-breakpoint
ALTER TABLE `companies` ADD `max_devices_per_user` integer;