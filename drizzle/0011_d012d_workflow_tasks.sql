CREATE TABLE `workflow_tasks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `execution_id` int NOT NULL,
  `node_id` varchar(120) NOT NULL,
  `status` enum('open','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
  `assignment_type` enum('user','team','role') NOT NULL,
  `assignee_user_id` int,
  `assignee_team_id` int,
  `assignee_role` varchar(48),
  `claimed_by_user_id` int,
  `correlation_id` varchar(160) NOT NULL,
  `claimed_at` timestamp NULL,
  `started_at` timestamp NULL,
  `completed_at` timestamp NULL,
  `cancelled_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `workflow_tasks_id` PRIMARY KEY(`id`),
  CONSTRAINT `workflow_tasks_execution_node_unique` UNIQUE(`execution_id`,`node_id`)
);
--> statement-breakpoint
CREATE INDEX `workflow_tasks_execution_idx` ON `workflow_tasks` (`execution_id`);
--> statement-breakpoint
CREATE INDEX `workflow_tasks_status_idx` ON `workflow_tasks` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `workflow_tasks_assignment_idx` ON `workflow_tasks` (`assignment_type`,`assignee_user_id`,`assignee_team_id`,`assignee_role`,`status`);
--> statement-breakpoint
CREATE INDEX `workflow_tasks_claimed_by_idx` ON `workflow_tasks` (`claimed_by_user_id`,`status`);
--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_execution_id_workflow_executions_id_fk` FOREIGN KEY (`execution_id`) REFERENCES `workflow_executions`(`id`) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_assignee_user_id_users_id_fk` FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_assignee_team_id_teams_id_fk` FOREIGN KEY (`assignee_team_id`) REFERENCES `teams`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_claimed_by_user_id_users_id_fk` FOREIGN KEY (`claimed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE TABLE `workflow_task_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `task_id` int NOT NULL,
  `action` varchar(48) NOT NULL,
  `actor_user_id` int,
  `before_data` json,
  `after_data` json,
  `correlation_id` varchar(160) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `workflow_task_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `workflow_task_events_task_created_idx` ON `workflow_task_events` (`task_id`,`created_at`);
--> statement-breakpoint
ALTER TABLE `workflow_task_events` ADD CONSTRAINT `workflow_task_events_task_id_workflow_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `workflow_tasks`(`id`) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `workflow_task_events` ADD CONSTRAINT `workflow_task_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null;
