CREATE TABLE `log_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`source` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`details` text,
	`history` text,
	`context` text,
	`device_id` integer,
	`company_id` integer,
	`user_id` integer,
	`app_version` text,
	`device_name` text,
	`system` text,
	`client_id` text,
	`merged_ids` text,
	`fingerprint` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`occurred_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `log_entries_client_idx` ON `log_entries` (`device_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `log_entries_last_idx` ON `log_entries` (`last_at`);--> statement-breakpoint
CREATE INDEX `log_entries_fingerprint_idx` ON `log_entries` (`fingerprint`,`last_at`);--> statement-breakpoint
INSERT INTO `log_entries` (`level`, `source`, `category`, `message`, `details`, `device_id`, `company_id`, `app_version`, `device_name`, `system`, `client_id`, `fingerprint`, `count`, `occurred_at`, `last_at`, `created_at`)
SELECT 'crash', CASE WHEN `platform` IN ('windows', 'android') THEN `platform` ELSE 'other' END, `kind`, `message`, `report`, `device_id`, `company_id`, `app_version`, `device_name`, `system`, `client_id`, 'crash|' || (CASE WHEN `platform` IN ('windows', 'android') THEN `platform` ELSE 'other' END) || '|' || `kind` || '|' || substr(`message`, 1, 200), 1, `occurred_at`, `occurred_at`, `created_at` FROM `crash_reports`;--> statement-breakpoint
DROP TABLE `crash_reports`;--> statement-breakpoint
ALTER TABLE `devices` ADD `queued_files` integer;