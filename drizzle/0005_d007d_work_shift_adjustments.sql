CREATE TABLE `work_shift_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`requested_by_user_id` int NOT NULL,
	`decided_by_user_id` int,
	`work_shift_adjustment_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reason` text NOT NULL,
	`decision_reason` text,
	`requested_changes` json NOT NULL,
	`before_snapshot` json NOT NULL,
	`after_snapshot` json,
	`requested_at` timestamp NOT NULL,
	`decided_at` timestamp,
	`applied_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_shift_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `work_shift_adjustments` ADD CONSTRAINT `work_shift_adjustments_session_id_work_shift_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `work_shift_sessions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_adjustments` ADD CONSTRAINT `work_shift_adjustments_requested_by_user_id_users_id_fk` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_adjustments` ADD CONSTRAINT `work_shift_adjustments_decided_by_user_id_users_id_fk` FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `work_shift_adjustments_session_idx` ON `work_shift_adjustments` (`session_id`);--> statement-breakpoint
CREATE INDEX `work_shift_adjustments_status_requested_idx` ON `work_shift_adjustments` (`work_shift_adjustment_status`,`requested_at`);--> statement-breakpoint
CREATE INDEX `work_shift_adjustments_requester_idx` ON `work_shift_adjustments` (`requested_by_user_id`,`requested_at`);--> statement-breakpoint
INSERT INTO `access_permissions` (`code`, `resource`, `action`, `description`, `active`)
VALUES
  ('work_shifts.adjust', 'work_shifts', 'adjust', 'Solicita ajustes auditáveis de jornada dentro do escopo autorizado.', true),
  ('work_shifts.approve', 'work_shifts', 'approve', 'Aprova ou rejeita ajustes auditáveis de jornada dentro do escopo autorizado.', true)
ON DUPLICATE KEY UPDATE
  `resource` = VALUES(`resource`),
  `action` = VALUES(`action`),
  `description` = VALUES(`description`),
  `active` = VALUES(`active`);