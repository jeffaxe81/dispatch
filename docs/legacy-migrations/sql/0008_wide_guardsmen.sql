CREATE TABLE `integration_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`connection_type` varchar(80) NOT NULL,
	`environment` varchar(32) NOT NULL DEFAULT 'simulacao',
	`base_url` varchar(2048),
	`active` boolean NOT NULL DEFAULT false,
	`simulation_only` boolean NOT NULL DEFAULT true,
	`configuration` json,
	`created_by_user_id` int NOT NULL,
	`updated_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integration_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `integration_connections_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `integration_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`credential_type` varchar(80) NOT NULL,
	`environment` varchar(32) NOT NULL DEFAULT 'simulacao',
	`description` text,
	`masked_summary` varchar(500),
	`encrypted_payload` text,
	`key_version` varchar(64),
	`expires_at` timestamp,
	`active` boolean NOT NULL DEFAULT false,
	`simulation_only` boolean NOT NULL DEFAULT true,
	`created_by_user_id` int NOT NULL,
	`updated_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integration_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `integration_credentials_name_environment_unique` UNIQUE(`name`,`environment`)
);
--> statement-breakpoint
CREATE TABLE `integration_event_catalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(160) NOT NULL,
	`source` varchar(100) NOT NULL,
	`description` text NOT NULL,
	`payload_schema` json,
	`example_payload` json,
	`version` varchar(32) NOT NULL DEFAULT 'v1',
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integration_event_catalog_id` PRIMARY KEY(`id`),
	CONSTRAINT `integration_event_catalog_code_version_unique` UNIQUE(`code`,`version`)
);
--> statement-breakpoint
CREATE TABLE `integration_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`execution_id` int,
	`workflow_id` int,
	`connection_id` int,
	`webhook_id` int,
	`integration_log_level` enum('info','sucesso','aviso','erro') NOT NULL DEFAULT 'info',
	`source` varchar(100) NOT NULL,
	`message` text NOT NULL,
	`endpoint` varchar(2048),
	`request_data` json,
	`response_data` json,
	`http_status` int,
	`duration_ms` int,
	`retry_attempt` int NOT NULL DEFAULT 0,
	`error_code` varchar(120),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `integration_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integration_webhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`method` varchar(12) NOT NULL DEFAULT 'POST',
	`path` varchar(255) NOT NULL,
	`allowed_ips` json,
	`workflow_id` int,
	`active` boolean NOT NULL DEFAULT false,
	`simulation_only` boolean NOT NULL DEFAULT true,
	`timeout_ms` int NOT NULL DEFAULT 15000,
	`created_by_user_id` int NOT NULL,
	`updated_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integration_webhooks_id` PRIMARY KEY(`id`),
	CONSTRAINT `integration_webhooks_path_unique` UNIQUE(`path`)
);
--> statement-breakpoint
CREATE TABLE `workflow_execution_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`execution_id` int NOT NULL,
	`node_id` varchar(120) NOT NULL,
	`node_type` varchar(100) NOT NULL,
	`workflow_execution_status` enum('pendente','em_execucao','concluida','falha','dead_letter','cancelada') NOT NULL DEFAULT 'pendente',
	`input_data` json,
	`output_data` json,
	`error_data` json,
	`duration_ms` int,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_execution_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `workflow_execution_steps_execution_node_unique` UNIQUE(`execution_id`,`node_id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workflow_id` int NOT NULL,
	`workflow_version_id` int,
	`trigger_type` varchar(80) NOT NULL DEFAULT 'manual',
	`workflow_execution_mode` enum('simulacao','producao') NOT NULL DEFAULT 'simulacao',
	`workflow_execution_status` enum('pendente','em_execucao','concluida','falha','dead_letter','cancelada') NOT NULL DEFAULT 'pendente',
	`idempotency_key` varchar(160),
	`input_data` json,
	`output_data` json,
	`error_data` json,
	`attempts` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 3,
	`queued_at` timestamp NOT NULL DEFAULT (now()),
	`started_at` timestamp,
	`completed_at` timestamp,
	`next_attempt_at` timestamp,
	`initiated_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_executions_id` PRIMARY KEY(`id`),
	CONSTRAINT `workflow_executions_idempotency_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `workflow_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workflow_id` int NOT NULL,
	`version` int NOT NULL,
	`definition` json NOT NULL,
	`validation_report` json,
	`change_summary` varchar(500),
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `workflow_versions_workflow_version_unique` UNIQUE(`workflow_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`workflow_status` enum('rascunho','publicado','arquivado') NOT NULL DEFAULT 'rascunho',
	`active` boolean NOT NULL DEFAULT false,
	`current_version` int NOT NULL DEFAULT 1,
	`simulation_only` boolean NOT NULL DEFAULT true,
	`created_by_user_id` int NOT NULL,
	`updated_by_user_id` int,
	`published_at` timestamp,
	`archived_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `integration_connections` ADD CONSTRAINT `integration_connections_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_connections` ADD CONSTRAINT `integration_connections_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_credentials` ADD CONSTRAINT `integration_credentials_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_credentials` ADD CONSTRAINT `integration_credentials_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD CONSTRAINT `integration_logs_execution_id_workflow_executions_id_fk` FOREIGN KEY (`execution_id`) REFERENCES `workflow_executions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD CONSTRAINT `integration_logs_workflow_id_workflows_id_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD CONSTRAINT `integration_logs_connection_id_integration_connections_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD CONSTRAINT `integration_logs_webhook_id_integration_webhooks_id_fk` FOREIGN KEY (`webhook_id`) REFERENCES `integration_webhooks`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_webhooks` ADD CONSTRAINT `integration_webhooks_workflow_id_workflows_id_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_webhooks` ADD CONSTRAINT `integration_webhooks_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_webhooks` ADD CONSTRAINT `integration_webhooks_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_execution_steps` ADD CONSTRAINT `workflow_execution_steps_execution_id_workflow_executions_id_fk` FOREIGN KEY (`execution_id`) REFERENCES `workflow_executions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_executions` ADD CONSTRAINT `workflow_executions_workflow_id_workflows_id_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_executions` ADD CONSTRAINT `workflow_executions_workflow_version_id_workflow_versions_id_fk` FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_executions` ADD CONSTRAINT `workflow_executions_initiated_by_user_id_users_id_fk` FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_versions` ADD CONSTRAINT `workflow_versions_workflow_id_workflows_id_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_versions` ADD CONSTRAINT `workflow_versions_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflows` ADD CONSTRAINT `workflows_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflows` ADD CONSTRAINT `workflows_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `integration_connections_active_idx` ON `integration_connections` (`active`,`environment`);--> statement-breakpoint
CREATE INDEX `integration_credentials_active_idx` ON `integration_credentials` (`active`,`environment`);--> statement-breakpoint
CREATE INDEX `integration_event_catalog_source_idx` ON `integration_event_catalog` (`source`,`active`);--> statement-breakpoint
CREATE INDEX `integration_logs_execution_idx` ON `integration_logs` (`execution_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `integration_logs_workflow_created_idx` ON `integration_logs` (`workflow_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `integration_logs_level_created_idx` ON `integration_logs` (`integration_log_level`,`created_at`);--> statement-breakpoint
CREATE INDEX `integration_webhooks_workflow_idx` ON `integration_webhooks` (`workflow_id`,`active`);--> statement-breakpoint
CREATE INDEX `workflow_execution_steps_execution_idx` ON `workflow_execution_steps` (`execution_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `workflow_executions_queue_idx` ON `workflow_executions` (`workflow_execution_status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `workflow_executions_workflow_created_idx` ON `workflow_executions` (`workflow_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `workflow_executions_mode_status_idx` ON `workflow_executions` (`workflow_execution_mode`,`workflow_execution_status`);--> statement-breakpoint
CREATE INDEX `workflow_versions_workflow_created_idx` ON `workflow_versions` (`workflow_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `workflows_status_active_idx` ON `workflows` (`workflow_status`,`active`);--> statement-breakpoint
CREATE INDEX `workflows_creator_idx` ON `workflows` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `workflows_updated_idx` ON `workflows` (`updated_at`);