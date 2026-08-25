CREATE TABLE `integration_openapi_operations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`spec_id` int NOT NULL,
	`operation_key` varchar(180) NOT NULL,
	`method` varchar(12) NOT NULL,
	`path` varchar(1024) NOT NULL,
	`summary` varchar(500),
	`description` text,
	`tags` json,
	`parameters` json,
	`request_body` json,
	`responses` json,
	`security` json,
	`generated_connection_id` int,
	`simulation_only` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integration_openapi_operations_id` PRIMARY KEY(`id`),
	CONSTRAINT `integration_openapi_operations_spec_key_unique` UNIQUE(`spec_id`,`operation_key`)
);
--> statement-breakpoint
CREATE TABLE `integration_openapi_specs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`api_version` varchar(80) NOT NULL,
	`openapi_version` varchar(32) NOT NULL,
	`description` text,
	`source_type` varchar(32) NOT NULL DEFAULT 'importado',
	`import_format` varchar(16) NOT NULL DEFAULT 'json',
	`document` json NOT NULL,
	`operation_count` int NOT NULL DEFAULT 0,
	`simulation_only` boolean NOT NULL DEFAULT true,
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integration_openapi_specs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `integration_openapi_operations` ADD CONSTRAINT `openapi_op_spec_fk` FOREIGN KEY (`spec_id`) REFERENCES `integration_openapi_specs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_openapi_operations` ADD CONSTRAINT `openapi_op_conn_fk` FOREIGN KEY (`generated_connection_id`) REFERENCES `integration_connections`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_openapi_specs` ADD CONSTRAINT `openapi_spec_actor_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `integration_openapi_operations_spec_idx` ON `integration_openapi_operations` (`spec_id`,`method`);--> statement-breakpoint
CREATE INDEX `integration_openapi_operations_connection_idx` ON `integration_openapi_operations` (`generated_connection_id`);--> statement-breakpoint
CREATE INDEX `integration_openapi_specs_source_idx` ON `integration_openapi_specs` (`source_type`,`created_at`);
