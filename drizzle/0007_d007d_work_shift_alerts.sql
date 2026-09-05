CREATE TABLE `work_shift_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(64) NOT NULL,
	`work_shift_alert_severity` enum('info','warning','critical') NOT NULL,
	`work_shift_alert_status` enum('open','acknowledged','resolved') NOT NULL DEFAULT 'open',
	`dedupe_key` varchar(255) NOT NULL,
	`user_id` int,
	`team_id` int,
	`session_id` int,
	`detected_at` timestamp NOT NULL,
	`acknowledged_at` timestamp,
	`acknowledged_by_user_id` int,
	`resolved_at` timestamp,
	`resolved_by_user_id` int,
	`metadata` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_shift_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `work_shift_alerts` ADD CONSTRAINT `work_shift_alerts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_alerts` ADD CONSTRAINT `work_shift_alerts_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_alerts` ADD CONSTRAINT `work_shift_alerts_session_id_work_shift_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `work_shift_sessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_alerts` ADD CONSTRAINT `work_shift_alerts_acknowledged_by_user_id_users_id_fk` FOREIGN KEY (`acknowledged_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_alerts` ADD CONSTRAINT `work_shift_alerts_resolved_by_user_id_users_id_fk` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `work_shift_alerts_dedupe_status_idx` ON `work_shift_alerts` (`dedupe_key`,`work_shift_alert_status`);--> statement-breakpoint
CREATE INDEX `work_shift_alerts_status_detected_idx` ON `work_shift_alerts` (`work_shift_alert_status`,`detected_at`);--> statement-breakpoint
CREATE INDEX `work_shift_alerts_detected_idx` ON `work_shift_alerts` (`detected_at`);--> statement-breakpoint
CREATE INDEX `work_shift_alerts_user_detected_idx` ON `work_shift_alerts` (`user_id`,`detected_at`);--> statement-breakpoint
CREATE INDEX `work_shift_alerts_team_detected_idx` ON `work_shift_alerts` (`team_id`,`detected_at`);--> statement-breakpoint
CREATE INDEX `work_shift_alerts_session_detected_idx` ON `work_shift_alerts` (`session_id`,`detected_at`);--> statement-breakpoint
INSERT INTO `access_permissions` (`code`, `resource`, `action`, `description`, `active`)
VALUES
  ('work_shift_alerts.view', 'work_shift_alerts', 'view', 'Visualiza alertas de jornada dentro do escopo autorizado.', true),
  ('work_shift_alerts.manage', 'work_shift_alerts', 'manage', 'Avalia, reconhece e resolve alertas de jornada dentro do escopo autorizado.', true)
ON DUPLICATE KEY UPDATE
  `resource` = VALUES(`resource`),
  `action` = VALUES(`action`),
  `description` = VALUES(`description`),
  `active` = VALUES(`active`);