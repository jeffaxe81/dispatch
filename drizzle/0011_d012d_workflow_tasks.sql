CREATE TABLE `workflow_tasks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `execution_id` int NOT NULL,
  `workflow_version_id` int NOT NULL,
  `node_id` varchar(120) NOT NULL,
  `status` enum('open','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
  `assignee_user_id` int,
  `created_by_user_id` int NOT NULL,
  `claimed_at` timestamp,
  `started_at` timestamp,
  `completed_at` timestamp,
  `cancelled_at` timestamp,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `workflow_tasks_id` PRIMARY KEY(`id`),
  CONSTRAINT `workflow_tasks_execution_node_unique` UNIQUE(`execution_id`,`node_id`)
);
--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_execution_id_workflow_executions_id_fk` FOREIGN KEY (`execution_id`) REFERENCES `workflow_executions`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_workflow_version_id_workflow_versions_id_fk` FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_assignee_user_id_users_id_fk` FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `workflow_tasks_assignee_status_idx` ON `workflow_tasks` (`assignee_user_id`,`status`);
--> statement-breakpoint
CREATE INDEX `workflow_tasks_execution_status_idx` ON `workflow_tasks` (`execution_id`,`status`);
