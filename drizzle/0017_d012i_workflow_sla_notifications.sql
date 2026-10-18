CREATE TABLE `workflow_sla_notifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `intent_id` int NOT NULL,
  `organization_id` int NOT NULL,
  `task_id` int NOT NULL,
  `workflow_version_id` int NOT NULL,
  `node_id` varchar(120) NOT NULL,
  `correlation_id` varchar(160) NOT NULL,
  `event_kind` enum('reminder','overdue','escalation') NOT NULL,
  `event_key` varchar(160) NOT NULL,
  `scheduled_at_ms` bigint unsigned NOT NULL,
  `accepted_at_ms` bigint unsigned NOT NULL,
  `delivery_version` int NOT NULL,
  CONSTRAINT `workflow_sla_notifications_id` PRIMARY KEY (`id`),
  CONSTRAINT `workflow_sla_notifications_intent_fk` FOREIGN KEY (`intent_id`) REFERENCES `workflow_sla_event_intents`(`id`) ON DELETE restrict,
  CONSTRAINT `workflow_sla_notifications_tenant_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict,
  CONSTRAINT `workflow_sla_notifications_task_fk` FOREIGN KEY (`task_id`) REFERENCES `workflow_tasks`(`id`) ON DELETE restrict,
  CONSTRAINT `workflow_sla_notifications_version_fk` FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_sla_notifications_intent_unique` ON `workflow_sla_notifications` (`intent_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_sla_notifications_tenant_event_unique` ON `workflow_sla_notifications` (`organization_id`,`event_key`);
--> statement-breakpoint
CREATE INDEX `workflow_sla_notifications_tenant_time_idx` ON `workflow_sla_notifications` (`organization_id`,`accepted_at_ms`);
