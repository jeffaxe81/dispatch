CREATE TABLE `workflow_sla_event_intents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `task_id` int NOT NULL,
  `organization_id` int NOT NULL,
  `workflow_version_id` int NOT NULL,
  `node_id` varchar(120) NOT NULL,
  `correlation_id` varchar(160) NOT NULL,
  `event_kind` enum('reminder','overdue','escalation') NOT NULL,
  `event_type` varchar(160) NOT NULL,
  `escalation_mode` enum('notify_only','reassign_task'),
  `scheduled_at` timestamp NOT NULL,
  `status` enum('pending','delivered') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `workflow_sla_event_intents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `workflow_sla_event_intents` ADD CONSTRAINT `workflow_sla_event_intents_task_id_workflow_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `workflow_tasks`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_sla_intents_task_kind_unique` ON `workflow_sla_event_intents` (`task_id`,`event_kind`);
--> statement-breakpoint
CREATE INDEX `workflow_sla_intents_tenant_status_idx` ON `workflow_sla_event_intents` (`organization_id`,`status`);
