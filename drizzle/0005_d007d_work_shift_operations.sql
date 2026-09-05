CREATE TABLE `work_shift_pending_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `user_id` int NOT NULL,
  `team_id` int,
  `anomaly_type` varchar(48) NOT NULL,
  `severity` enum('info','warning','critical') NOT NULL DEFAULT 'warning',
  `status` enum('open','in_review','waiting_information','resolved','no_adjustment_required') NOT NULL DEFAULT 'open',
  `dedupe_key` varchar(512) NOT NULL,
  `reference_id` varchar(180) NOT NULL,
  `window_key` varchar(180) NOT NULL,
  `expected_data` json,
  `observed_data` json,
  `detected_at` timestamp NOT NULL,
  `sla_due_at` timestamp,
  `sla_level` int NOT NULL DEFAULT 0,
  `responsible_user_id` int,
  `resolved_by_user_id` int,
  `resolved_at` timestamp,
  `justification` text,
  `version` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `work_shift_pending_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `work_shift_pending_items_dedupe_unique` UNIQUE(`dedupe_key`)
);
--> statement-breakpoint
CREATE TABLE `work_shift_pending_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `pending_item_id` int NOT NULL,
  `tenant_id` int NOT NULL,
  `actor_user_id` int,
  `from_status` varchar(48),
  `to_status` varchar(48) NOT NULL,
  `justification` text,
  `before_data` json,
  `after_data` json,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `work_shift_pending_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_shift_sla_policies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `anomaly_type` varchar(48),
  `severity` enum('info','warning','critical'),
  `warning_after_minutes` int,
  `critical_after_minutes` int NOT NULL,
  `escalation_after_minutes` int,
  `active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `work_shift_sla_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_shift_retention_policies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `pending_retention_days` int,
  `history_retention_days` int,
  `audit_protected` boolean NOT NULL DEFAULT true,
  `active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `work_shift_retention_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `work_shift_pending_items` ADD CONSTRAINT `work_shift_pending_items_tenant_id_organizations_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `work_shift_pending_items` ADD CONSTRAINT `work_shift_pending_items_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `work_shift_pending_items` ADD CONSTRAINT `work_shift_pending_items_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `work_shift_pending_items` ADD CONSTRAINT `work_shift_pending_items_responsible_user_id_users_id_fk` FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `work_shift_pending_items` ADD CONSTRAINT `work_shift_pending_items_resolved_by_user_id_users_id_fk` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `work_shift_pending_history` ADD CONSTRAINT `work_shift_pending_history_pending_item_id_work_shift_pending_items_id_fk` FOREIGN KEY (`pending_item_id`) REFERENCES `work_shift_pending_items`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `work_shift_pending_history` ADD CONSTRAINT `work_shift_pending_history_tenant_id_organizations_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `work_shift_pending_history` ADD CONSTRAINT `work_shift_pending_history_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `work_shift_sla_policies` ADD CONSTRAINT `work_shift_sla_policies_tenant_id_organizations_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `work_shift_retention_policies` ADD CONSTRAINT `work_shift_retention_policies_tenant_id_organizations_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `work_shift_pending_items_scope_status_idx` ON `work_shift_pending_items` (`tenant_id`,`team_id`,`status`);
--> statement-breakpoint
CREATE INDEX `work_shift_pending_items_user_detected_idx` ON `work_shift_pending_items` (`tenant_id`,`user_id`,`detected_at`);
--> statement-breakpoint
CREATE INDEX `work_shift_pending_items_sla_idx` ON `work_shift_pending_items` (`tenant_id`,`status`,`sla_due_at`);
--> statement-breakpoint
CREATE INDEX `work_shift_pending_history_item_created_idx` ON `work_shift_pending_history` (`pending_item_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `work_shift_sla_policies_scope_idx` ON `work_shift_sla_policies` (`tenant_id`,`active`,`anomaly_type`,`severity`);
--> statement-breakpoint
CREATE INDEX `work_shift_retention_policies_scope_idx` ON `work_shift_retention_policies` (`tenant_id`,`active`);