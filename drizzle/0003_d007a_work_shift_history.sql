CREATE TABLE `work_shift_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`event_type` varchar(48) NOT NULL,
	`occurred_at` timestamp NOT NULL,
	`actor_user_id` int,
	`reason` text,
	`before_data` json,
	`after_data` json,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `work_shift_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_shift_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`team_id` int,
	`started_at` timestamp NOT NULL,
	`paused_at` timestamp,
	`ended_at` timestamp,
	`work_shift_session_status` enum('active','paused','ended','cancelled') NOT NULL,
	`worked_seconds` int NOT NULL DEFAULT 0,
	`paused_seconds` int NOT NULL DEFAULT 0,
	`overtime_seconds` int NOT NULL DEFAULT 0,
	`late_start_seconds` int NOT NULL DEFAULT 0,
	`early_end_seconds` int NOT NULL DEFAULT 0,
	`work_shift_source` enum('self','supervisor','admin','migration','system') NOT NULL DEFAULT 'self',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_shift_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `work_shift_events` ADD CONSTRAINT `work_shift_events_session_id_work_shift_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `work_shift_sessions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_events` ADD CONSTRAINT `work_shift_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_sessions` ADD CONSTRAINT `work_shift_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_sessions` ADD CONSTRAINT `work_shift_sessions_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `work_shift_events_session_occurred_idx` ON `work_shift_events` (`session_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `work_shift_sessions_user_started_idx` ON `work_shift_sessions` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `work_shift_sessions_user_status_idx` ON `work_shift_sessions` (`user_id`,`work_shift_session_status`);--> statement-breakpoint
CREATE INDEX `work_shift_sessions_team_started_idx` ON `work_shift_sessions` (`team_id`,`started_at`);--> statement-breakpoint
INSERT INTO `access_permissions` (`code`, `resource`, `action`, `description`, `active`)
VALUES
  ('work_shifts.view', 'work_shifts', 'view', 'Consulta a própria jornada e histórico autorizado.', true),
  ('work_shifts.control', 'work_shifts', 'control', 'Inicia, pausa, retoma e encerra a própria jornada.', true)
ON DUPLICATE KEY UPDATE
  `resource` = VALUES(`resource`),
  `action` = VALUES(`action`),
  `description` = VALUES(`description`),
  `active` = VALUES(`active`);
