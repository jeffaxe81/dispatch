CREATE TABLE `work_shift_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(180) NOT NULL,
	`organization_id` int NOT NULL,
	`organizational_unit_id` int,
	`work_shift_schedule_type` enum('fixed','cyclic_12x36','custom_cycle') NOT NULL,
	`timezone` varchar(80) NOT NULL,
	`start_time_local` varchar(5) NOT NULL,
	`weekdays` json,
	`planned_duration_minutes` int NOT NULL,
	`break_policy_minutes` int,
	`cycle_anchor_at` timestamp,
	`cycle_work_minutes` int,
	`cycle_rest_minutes` int,
	`effective_from` timestamp NOT NULL,
	`effective_until` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_shift_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `work_shift_schedules_org_code_unique` UNIQUE(`organization_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `work_shift_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schedule_id` int NOT NULL,
	`user_id` int NOT NULL,
	`team_id` int,
	`effective_from` timestamp NOT NULL,
	`effective_until` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_shift_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_shift_schedule_exceptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignment_id` int NOT NULL,
	`work_shift_schedule_exception_type` enum('day_off','replacement_shift','leave','extra_call','holiday_override') NOT NULL,
	`starts_at` timestamp NOT NULL,
	`ends_at` timestamp NOT NULL,
	`reason` text,
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `work_shift_schedule_exceptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `work_shift_sessions` ADD `schedule_assignment_id` int;--> statement-breakpoint
ALTER TABLE `work_shift_sessions` ADD `scheduled_start_at` timestamp;--> statement-breakpoint
ALTER TABLE `work_shift_sessions` ADD `scheduled_end_at` timestamp;--> statement-breakpoint
ALTER TABLE `work_shift_schedules` ADD CONSTRAINT `work_shift_schedules_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_schedules` ADD CONSTRAINT `work_shift_schedules_organizational_unit_id_organizational_units_id_fk` FOREIGN KEY (`organizational_unit_id`) REFERENCES `organizational_units`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_assignments` ADD CONSTRAINT `work_shift_assignments_schedule_id_work_shift_schedules_id_fk` FOREIGN KEY (`schedule_id`) REFERENCES `work_shift_schedules`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_assignments` ADD CONSTRAINT `work_shift_assignments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_assignments` ADD CONSTRAINT `work_shift_assignments_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_schedule_exceptions` ADD CONSTRAINT `work_shift_schedule_exceptions_assignment_id_work_shift_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `work_shift_assignments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_schedule_exceptions` ADD CONSTRAINT `work_shift_schedule_exceptions_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_sessions` ADD CONSTRAINT `work_shift_sessions_schedule_assignment_id_work_shift_assignments_id_fk` FOREIGN KEY (`schedule_assignment_id`) REFERENCES `work_shift_assignments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `work_shift_schedules_scope_idx` ON `work_shift_schedules` (`organization_id`,`organizational_unit_id`,`active`);--> statement-breakpoint
CREATE INDEX `work_shift_schedules_effective_idx` ON `work_shift_schedules` (`effective_from`,`effective_until`);--> statement-breakpoint
CREATE INDEX `work_shift_assignments_user_effective_idx` ON `work_shift_assignments` (`user_id`,`active`,`effective_from`,`effective_until`);--> statement-breakpoint
CREATE INDEX `work_shift_assignments_schedule_idx` ON `work_shift_assignments` (`schedule_id`,`active`);--> statement-breakpoint
CREATE INDEX `work_shift_assignments_team_idx` ON `work_shift_assignments` (`team_id`,`active`);--> statement-breakpoint
CREATE INDEX `work_shift_schedule_exceptions_assignment_start_idx` ON `work_shift_schedule_exceptions` (`assignment_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `work_shift_sessions_schedule_assignment_idx` ON `work_shift_sessions` (`schedule_assignment_id`);--> statement-breakpoint
INSERT INTO `access_permissions` (`code`, `resource`, `action`, `description`, `active`)
VALUES
  ('work_shift_schedules.view', 'work_shift_schedules', 'view', 'Consulta escalas, planejamento resolvido e cobertura dentro do escopo autorizado.', true),
  ('work_shift_schedules.manage', 'work_shift_schedules', 'manage', 'Cria escalas, associa usuários e registra exceções dentro do escopo autorizado.', true)
ON DUPLICATE KEY UPDATE
  `resource` = VALUES(`resource`),
  `action` = VALUES(`action`),
  `description` = VALUES(`description`),
  `active` = VALUES(`active`);