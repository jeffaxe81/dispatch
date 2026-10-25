ALTER TABLE `workflow_tasks` ADD `sla_started_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD `sla_reminder_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD `sla_due_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD `sla_escalation_at` timestamp NULL;
--> statement-breakpoint
CREATE INDEX `workflow_tasks_sla_due_idx` ON `workflow_tasks` (`status`,`sla_due_at`);
