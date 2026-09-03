CREATE TABLE `embedded_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`name` varchar(180) NOT NULL,
	`integration_connection_id` int,
	`url` varchar(2048) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`display_mode` enum('embedded','fullscreen','split') NOT NULL DEFAULT 'embedded',
	`allowed_roles` json NOT NULL,
	`created_by_user_id` int NOT NULL,
	`updated_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `embedded_integrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `embedded_integrations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `operational_presence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`team_id` int NOT NULL,
	`user_id` int,
	`work_session_id` int,
	`status` enum('available','busy','paused','offline','out_of_shift') NOT NULL DEFAULT 'offline',
	`available_for_dispatch` boolean NOT NULL DEFAULT false,
	`current_region_code` varchar(80),
	`skills` json,
	`last_location_id` int,
	`last_status_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operational_presence_id` PRIMARY KEY(`id`),
	CONSTRAINT `operational_presence_team_unique` UNIQUE(`team_id`)
);
--> statement-breakpoint
CREATE TABLE `route_track_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`route_track_id` int NOT NULL,
	`team_location_id` int NOT NULL,
	`sequence` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `route_track_points_id` PRIMARY KEY(`id`),
	CONSTRAINT `route_track_points_track_sequence_unique` UNIQUE(`route_track_id`,`sequence`),
	CONSTRAINT `route_track_points_location_unique` UNIQUE(`route_track_id`,`team_location_id`)
);
--> statement-breakpoint
CREATE TABLE `route_tracks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`team_id` int NOT NULL,
	`incident_id` int,
	`work_session_id` int,
	`status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
	`started_at` timestamp NOT NULL,
	`ended_at` timestamp,
	`duration_seconds` int,
	`distance_meters` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `route_tracks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shift_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shift_template_id` int NOT NULL,
	`user_id` int,
	`team_id` int,
	`scheduled_start_at` timestamp NOT NULL,
	`scheduled_end_at` timestamp NOT NULL,
	`status` enum('scheduled','active','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shift_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shift_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organization_id` int,
	`code` varchar(80) NOT NULL,
	`name` varchar(180) NOT NULL,
	`kind` enum('fixed','12x36','custom') NOT NULL,
	`work_minutes` int NOT NULL,
	`rest_minutes` int NOT NULL DEFAULT 0,
	`timezone` varchar(80) NOT NULL DEFAULT 'America/Sao_Paulo',
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shift_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `shift_templates_org_code_unique` UNIQUE(`organization_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `work_session_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`work_session_id` int NOT NULL,
	`event_type` enum('start','pause','resume','end','adjustment') NOT NULL,
	`occurred_at` timestamp NOT NULL,
	`actor_user_id` int,
	`reason` text,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `work_session_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shift_schedule_id` int,
	`user_id` int,
	`team_id` int,
	`started_at` timestamp NOT NULL,
	`ended_at` timestamp,
	`paused_at` timestamp,
	`total_pause_seconds` int NOT NULL DEFAULT 0,
	`status` enum('open','paused','closed','adjusted') NOT NULL DEFAULT 'open',
	`source` enum('manual','schedule','integration','admin_adjustment') NOT NULL DEFAULT 'manual',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `embedded_integrations` ADD CONSTRAINT `embedded_integrations_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `embedded_integrations` ADD CONSTRAINT `embedded_integrations_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `embedded_integrations` ADD CONSTRAINT `embedded_integrations_connection_fk` FOREIGN KEY (`integration_connection_id`) REFERENCES `integration_connections`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_presence` ADD CONSTRAINT `operational_presence_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_presence` ADD CONSTRAINT `operational_presence_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_presence` ADD CONSTRAINT `operational_presence_work_session_id_work_sessions_id_fk` FOREIGN KEY (`work_session_id`) REFERENCES `work_sessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_presence` ADD CONSTRAINT `operational_presence_last_location_id_team_locations_id_fk` FOREIGN KEY (`last_location_id`) REFERENCES `team_locations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_track_points` ADD CONSTRAINT `route_track_points_route_track_id_route_tracks_id_fk` FOREIGN KEY (`route_track_id`) REFERENCES `route_tracks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_track_points` ADD CONSTRAINT `route_track_points_team_location_id_team_locations_id_fk` FOREIGN KEY (`team_location_id`) REFERENCES `team_locations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_tracks` ADD CONSTRAINT `route_tracks_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_tracks` ADD CONSTRAINT `route_tracks_incident_id_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_tracks` ADD CONSTRAINT `route_tracks_work_session_id_work_sessions_id_fk` FOREIGN KEY (`work_session_id`) REFERENCES `work_sessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD CONSTRAINT `shift_schedules_shift_template_id_shift_templates_id_fk` FOREIGN KEY (`shift_template_id`) REFERENCES `shift_templates`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD CONSTRAINT `shift_schedules_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD CONSTRAINT `shift_schedules_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD CONSTRAINT `shift_schedules_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_templates` ADD CONSTRAINT `shift_templates_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_session_events` ADD CONSTRAINT `work_session_events_work_session_id_work_sessions_id_fk` FOREIGN KEY (`work_session_id`) REFERENCES `work_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_session_events` ADD CONSTRAINT `work_session_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_sessions` ADD CONSTRAINT `work_sessions_shift_schedule_id_shift_schedules_id_fk` FOREIGN KEY (`shift_schedule_id`) REFERENCES `shift_schedules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_sessions` ADD CONSTRAINT `work_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_sessions` ADD CONSTRAINT `work_sessions_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `embedded_integrations_enabled_idx` ON `embedded_integrations` (`enabled`);--> statement-breakpoint
CREATE INDEX `operational_presence_dispatch_idx` ON `operational_presence` (`available_for_dispatch`,`status`);--> statement-breakpoint
CREATE INDEX `operational_presence_user_idx` ON `operational_presence` (`user_id`);--> statement-breakpoint
CREATE INDEX `route_tracks_team_started_idx` ON `route_tracks` (`team_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `route_tracks_incident_idx` ON `route_tracks` (`incident_id`);--> statement-breakpoint
CREATE INDEX `route_tracks_status_idx` ON `route_tracks` (`status`);--> statement-breakpoint
CREATE INDEX `shift_schedules_user_start_idx` ON `shift_schedules` (`user_id`,`scheduled_start_at`);--> statement-breakpoint
CREATE INDEX `shift_schedules_team_start_idx` ON `shift_schedules` (`team_id`,`scheduled_start_at`);--> statement-breakpoint
CREATE INDEX `shift_schedules_status_start_idx` ON `shift_schedules` (`status`,`scheduled_start_at`);--> statement-breakpoint
CREATE INDEX `shift_templates_org_active_idx` ON `shift_templates` (`organization_id`,`active`);--> statement-breakpoint
CREATE INDEX `work_session_events_session_time_idx` ON `work_session_events` (`work_session_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `work_sessions_user_started_idx` ON `work_sessions` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `work_sessions_team_started_idx` ON `work_sessions` (`team_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `work_sessions_status_started_idx` ON `work_sessions` (`status`,`started_at`);