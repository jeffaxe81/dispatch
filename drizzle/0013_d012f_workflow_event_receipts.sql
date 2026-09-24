CREATE TABLE `workflow_event_receipts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(128) NOT NULL,
  `event_id` varchar(160) NOT NULL,
  `event_type` varchar(160) NOT NULL,
  `producer` varchar(80) NOT NULL,
  `correlation_id` varchar(160) NOT NULL,
  `status` enum('pending','processed','ignored','failed') NOT NULL DEFAULT 'pending',
  `workflow_execution_id` int NULL,
  `failure_code` varchar(160) NULL,
  `processed_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `workflow_event_receipts_pk` PRIMARY KEY(`id`),
  CONSTRAINT `workflow_event_receipts_execution_fk` FOREIGN KEY (`workflow_execution_id`) REFERENCES `workflow_executions`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_event_receipts_tenant_event_unique` ON `workflow_event_receipts` (`tenant_id`, `event_id`);
--> statement-breakpoint
CREATE INDEX `workflow_event_receipts_status_created_idx` ON `workflow_event_receipts` (`status`, `created_at`);
--> statement-breakpoint
CREATE INDEX `workflow_event_receipts_correlation_idx` ON `workflow_event_receipts` (`correlation_id`);