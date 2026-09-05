CREATE TABLE `embedded_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`integration_connection_id` int,
	`code` varchar(100) NOT NULL,
	`name` varchar(180) NOT NULL,
	`url` varchar(2048) NOT NULL,
	`embedded_integration_display_mode` enum('iframe','external') NOT NULL DEFAULT 'iframe',
	`allow_fullscreen` boolean NOT NULL DEFAULT false,
	`enabled` boolean NOT NULL DEFAULT false,
	`allowed_roles` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `embedded_integrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `embedded_integrations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `operational_presence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`team_id` int,
	`work_session_id` int,
	`operational_presence_status` enum('available','busy','paused','offline','out_of_shift') NOT NULL DEFAULT 'out_of_shift',
	`available_for_dispatch` boolean NOT NULL DEFAULT false,
	`region_code` varchar(80),
	`skills` json,
	`last_changed_at` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operational_presence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `route_track_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`route_track_id` int NOT NULL,
	`team_location_id` int NOT NULL,
	`sequence` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `route_track_points_id` PRIMARY KEY(`id`),
	CONSTRAINT `route_track_points_track_sequence_unique` UNIQUE(`route_track_id`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `route_tracks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`team_id` int NOT NULL,
	`user_id` int,
	`incident_id` int,
	`assignment_id` int,
	`started_at` timestamp NOT NULL,
	`ended_at` timestamp,
	`distance_meters` int,
	`duration_seconds` int,
	`route_track_status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
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
	`shift_schedule_status` enum('scheduled','active','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shift_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shift_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organization_id` int NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`shift_template_kind` enum('fixed','12x36','custom') NOT NULL,
	`work_minutes` int NOT NULL,
	`rest_minutes` int NOT NULL,
	`timezone` varchar(80) NOT NULL,
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
	`work_session_event_type` enum('start','pause','resume','end','adjustment') NOT NULL,
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
	`total_pause_seconds` int NOT NULL DEFAULT 0,
	`work_session_status` enum('open','paused','closed','adjusted') NOT NULL DEFAULT 'open',
	`work_session_source` enum('manual','schedule','integration','admin_adjustment') NOT NULL DEFAULT 'manual',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `embedded_integrations` ADD CONSTRAINT `embedded_integrations_connection_fk` FOREIGN KEY (`integration_connection_id`) REFERENCES `integration_connections`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_presence` ADD CONSTRAINT `operational_presence_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_presence` ADD CONSTRAINT `operational_presence_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_presence` ADD CONSTRAINT `operational_presence_work_session_id_work_sessions_id_fk` FOREIGN KEY (`work_session_id`) REFERENCES `work_sessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_track_points` ADD CONSTRAINT `route_track_points_route_track_id_route_tracks_id_fk` FOREIGN KEY (`route_track_id`) REFERENCES `route_tracks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_track_points` ADD CONSTRAINT `route_track_points_team_location_id_team_locations_id_fk` FOREIGN KEY (`team_location_id`) REFERENCES `team_locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_tracks` ADD CONSTRAINT `route_tracks_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_tracks` ADD CONSTRAINT `route_tracks_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_tracks` ADD CONSTRAINT `route_tracks_incident_id_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_tracks` ADD CONSTRAINT `route_tracks_assignment_id_incident_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `incident_assignments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD CONSTRAINT `shift_schedules_shift_template_id_shift_templates_id_fk` FOREIGN KEY (`shift_template_id`) REFERENCES `shift_templates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD CONSTRAINT `shift_schedules_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD CONSTRAINT `shift_schedules_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD CONSTRAINT `shift_schedules_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_templates` ADD CONSTRAINT `shift_templates_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_session_events` ADD CONSTRAINT `work_session_events_work_session_id_work_sessions_id_fk` FOREIGN KEY (`work_session_id`) REFERENCES `work_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_session_events` ADD CONSTRAINT `work_session_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_sessions` ADD CONSTRAINT `work_sessions_shift_schedule_id_shift_schedules_id_fk` FOREIGN KEY (`shift_schedule_id`) REFERENCES `shift_schedules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_sessions` ADD CONSTRAINT `work_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_sessions` ADD CONSTRAINT `work_sessions_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `embedded_integrations_connection_enabled_idx` ON `embedded_integrations` (`integration_connection_id`,`enabled`);--> statement-breakpoint
CREATE INDEX `operational_presence_team_dispatch_status_idx` ON `operational_presence` (`team_id`,`available_for_dispatch`,`operational_presence_status`);--> statement-breakpoint
CREATE INDEX `operational_presence_user_status_idx` ON `operational_presence` (`user_id`,`operational_presence_status`);--> statement-breakpoint
CREATE INDEX `route_track_points_location_idx` ON `route_track_points` (`team_location_id`);--> statement-breakpoint
CREATE INDEX `route_tracks_team_status_started_idx` ON `route_tracks` (`team_id`,`route_track_status`,`started_at`);--> statement-breakpoint
CREATE INDEX `route_tracks_incident_assignment_idx` ON `route_tracks` (`incident_id`,`assignment_id`);--> statement-breakpoint
CREATE INDEX `shift_schedules_user_start_idx` ON `shift_schedules` (`user_id`,`scheduled_start_at`);--> statement-breakpoint
CREATE INDEX `shift_schedules_team_start_idx` ON `shift_schedules` (`team_id`,`scheduled_start_at`);--> statement-breakpoint
CREATE INDEX `shift_schedules_template_status_idx` ON `shift_schedules` (`shift_template_id`,`shift_schedule_status`);--> statement-breakpoint
CREATE INDEX `shift_templates_org_active_idx` ON `shift_templates` (`organization_id`,`active`);--> statement-breakpoint
CREATE INDEX `work_session_events_session_occurred_idx` ON `work_session_events` (`work_session_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `work_sessions_user_status_started_idx` ON `work_sessions` (`user_id`,`work_session_status`,`started_at`);--> statement-breakpoint
CREATE INDEX `work_sessions_team_status_started_idx` ON `work_sessions` (`team_id`,`work_session_status`,`started_at`);
