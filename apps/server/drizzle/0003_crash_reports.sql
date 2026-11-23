CREATE TABLE `crash_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer,
	`company_id` integer,
	`client_id` text NOT NULL,
	`platform` text NOT NULL,
	`app_version` text,
	`device_name` text,
	`system` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`report` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crash_reports_client_idx` ON `crash_reports` (`device_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `crash_reports_created_idx` ON `crash_reports` (`created_at`);