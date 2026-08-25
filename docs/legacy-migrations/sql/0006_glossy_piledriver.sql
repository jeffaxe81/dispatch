CREATE TABLE `general_setting_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`section` varchar(80) NOT NULL,
	`setting_key` varchar(120) NOT NULL,
	`value` json,
	`description` varchar(500),
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `general_setting_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `general_setting_entries_section_key_unique` UNIQUE(`section`,`setting_key`)
);
--> statement-breakpoint
CREATE INDEX `general_setting_entries_section_idx` ON `general_setting_entries` (`section`,`active`);