CREATE TABLE `api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`max_connections` integer NOT NULL,
	`created_by` integer,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_company_idx` ON `api_keys` (`company_id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`number` text,
	`location` text,
	`notes` text,
	`is_service` integer DEFAULT false NOT NULL,
	`disabled_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_name_unique` ON `companies` (`name`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`api_key_id` integer NOT NULL,
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
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_hash_unique` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `devices_key_idx` ON `devices` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `devices_user_idx` ON `devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `machines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer,
	`machine_no` text NOT NULL,
	`family` text NOT NULL,
	`model` text,
	`line` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `machines_company_no_idx` ON `machines` (`company_id`,`machine_no`);--> statement-breakpoint
CREATE TABLE `result_shafts` (
	`result_id` integer NOT NULL,
	`shaft` integer NOT NULL,
	`label` text NOT NULL,
	`count` integer NOT NULL,
	`cpk_x` real,
	`cpk_y` real,
	`cpk_xy` real,
	`rating` text,
	PRIMARY KEY(`result_id`, `shaft`),
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer,
	`machine_id` integer,
	`sha256` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`file_gz` blob NOT NULL,
	`file_modified_at` integer,
	`machine_no` text NOT NULL,
	`machine_family` text NOT NULL,
	`head_type` text NOT NULL,
	`head_serial` text NOT NULL,
	`tool_type` text,
	`tool_serial` text,
	`h08m_variant` text,
	`test_date` text NOT NULL,
	`date_source` text NOT NULL,
	`coefficient` real NOT NULL,
	`coefficient_source` text NOT NULL,
	`algorithm_version` text NOT NULL,
	`config_version` text NOT NULL,
	`cp_x` real,
	`cpk_x` real,
	`cp_y` real,
	`cpk_y` real,
	`cpk_xy` real,
	`rating` text,
	`mean_x` real NOT NULL,
	`mean_y` real NOT NULL,
	`mean_q` real NOT NULL,
	`sigma3_x` real NOT NULL,
	`sigma3_y` real NOT NULL,
	`sigma3_q` real NOT NULL,
	`measured` integer NOT NULL,
	`expected` integer,
	`failed` integer NOT NULL,
	`component_status` text NOT NULL,
	`warnings` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`uploaded_by` integer,
	`device_id` integer,
	`previous_cpk_xy` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `results_company_date_idx` ON `results` (`company_id`,`test_date`);--> statement-breakpoint
CREATE INDEX `results_head_idx` ON `results` (`head_serial`,`head_type`,`test_date`);--> statement-breakpoint
CREATE INDEX `results_machine_idx` ON `results` (`machine_no`);--> statement-breakpoint
CREATE INDEX `results_sha_idx` ON `results` (`sha256`);--> statement-breakpoint
CREATE INDEX `results_test_date_idx` ON `results` (`test_date`);--> statement-breakpoint
CREATE INDEX `results_created_idx` ON `results` (`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`disabled_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_company_idx` ON `users` (`company_id`);