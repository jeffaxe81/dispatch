ALTER TABLE `workflow_executions`
ADD `current_node_id` varchar(120) NULL,
ADD `correlation_id` varchar(160) NULL;
--> statement-breakpoint
CREATE INDEX `workflow_executions_correlation_idx` ON `workflow_executions` (`correlation_id`);
