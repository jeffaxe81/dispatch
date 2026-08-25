ALTER TABLE `workflow_executions` ADD `retry_of_execution_id` int;--> statement-breakpoint
ALTER TABLE `workflow_executions` ADD CONSTRAINT `workflow_executions_retry_source_unique` UNIQUE(`retry_of_execution_id`);--> statement-breakpoint
ALTER TABLE `workflow_executions` ADD CONSTRAINT `workflow_execution_retry_fk` FOREIGN KEY (`retry_of_execution_id`) REFERENCES `workflow_executions`(`id`) ON DELETE set null ON UPDATE no action;
