CREATE TABLE `dashboard_saved_filters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`start_date` timestamp,
	`end_date` timestamp,
	`team_id` int,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dashboard_saved_filters_id` PRIMARY KEY(`id`),
	CONSTRAINT `dashboard_filters_user_name_unique` UNIQUE(`user_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `dashboard_saved_filters` ADD CONSTRAINT `dashboard_saved_filters_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dashboard_saved_filters` ADD CONSTRAINT `dashboard_saved_filters_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `dashboard_filters_user_default_idx` ON `dashboard_saved_filters` (`user_id`,`is_default`);