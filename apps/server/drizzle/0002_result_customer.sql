ALTER TABLE `results` ADD `customer` text;--> statement-breakpoint
CREATE INDEX `results_customer_idx` ON `results` (`company_id`,`customer`);