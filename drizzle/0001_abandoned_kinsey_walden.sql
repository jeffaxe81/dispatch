CREATE TABLE `access_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(120) NOT NULL,
	`resource` varchar(80) NOT NULL,
	`action` varchar(80) NOT NULL,
	`description` text,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `access_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_permissions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `access_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`role_scope` enum('global','organizacao','unidade','departamento','grupo','equipe') NOT NULL DEFAULT 'organizacao',
	`is_system` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `access_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_roles_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `alrt_incoming_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event_id` varchar(120) NOT NULL,
	`idempotency_key` varchar(180) NOT NULL,
	`correlation_id` varchar(160) NOT NULL,
	`source_environment` varchar(32) NOT NULL,
	`event_type` varchar(80) NOT NULL,
	`schema_version` varchar(16) NOT NULL,
	`category` varchar(160) NOT NULL,
	`incident_priority` enum('baixa','media','alta','critica') NOT NULL DEFAULT 'media',
	`description` text NOT NULL,
	`address` varchar(500) NOT NULL,
	`latitude` decimal(10,7) NOT NULL,
	`longitude` decimal(10,7) NOT NULL,
	`reported_at` timestamp NOT NULL,
	`payload_digest` varchar(64) NOT NULL,
	`alrt_incoming_event_status` enum('recebido','validado','rejeitado','processado') NOT NULL DEFAULT 'recebido',
	`created_incident_id` int,
	`error_code` varchar(80),
	`received_at` timestamp NOT NULL DEFAULT (now()),
	`processed_at` timestamp,
	CONSTRAINT `alrt_incoming_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `alrt_incoming_events_event_unique` UNIQUE(`event_id`),
	CONSTRAINT `alrt_incoming_events_idempotency_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resource_type` varchar(80) NOT NULL,
	`resource_id` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`actor_user_id` int,
	`before_data` json,
	`after_data` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dashboard_saved_filters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`start_date` timestamp,
	`end_date` timestamp,
	`team_id` int,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dashboard_saved_filters_id` PRIMARY KEY(`id`),
	CONSTRAINT `dashboard_filters_user_name_unique` UNIQUE(`user_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `external_incident_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`incoming_event_id` int NOT NULL,
	`workflow_id` int NOT NULL,
	`workflow_version_id` int NOT NULL,
	`correlation_id` varchar(160) NOT NULL,
	`external_incident_review_status` enum('pendente','confirmada','descartada') NOT NULL DEFAULT 'pendente',
	`category` varchar(160) NOT NULL,
	`incident_priority` enum('baixa','media','alta','critica') NOT NULL DEFAULT 'media',
	`incident_origin` enum('central','telefone','chat','video','sensor','agente','integracao') NOT NULL DEFAULT 'integracao',
	`requester_name` varchar(200),
	`requester_contact` varchar(80),
	`description` text NOT NULL,
	`address` varchar(500) NOT NULL,
	`latitude` decimal(10,7) NOT NULL,
	`longitude` decimal(10,7) NOT NULL,
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`review_note` text,
	`created_incident_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_incident_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_incident_reviews_event_unique` UNIQUE(`incoming_event_id`)
);
--> statement-breakpoint
CREATE TABLE `faq_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`question` varchar(280) NOT NULL,
	`detail` text,
	`faq_suggestion_status` enum('pendente','avaliada','publicada','recusada') NOT NULL DEFAULT 'pendente',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `faq_suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `general_setting_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`section` varchar(80) NOT NULL,
	`setting_key` varchar(120) NOT NULL,
	`value` json,
	`description` varchar(500),
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `general_setting_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `general_setting_entries_section_key_unique` UNIQUE(`section`,`setting_key`)
);
--> statement-breakpoint
CREATE TABLE `general_settings` (
	`id` int NOT NULL,
	`map_center_latitude` decimal(10,7) NOT NULL DEFAULT '-27.0976000',
	`map_center_longitude` decimal(10,7) NOT NULL DEFAULT '-48.9104000',
	`map_default_zoom` int NOT NULL DEFAULT 13,
	`map_type` varchar(20) NOT NULL DEFAULT 'roadmap',
	`map_traffic_enabled` boolean NOT NULL DEFAULT false,
	`map_auto_fit_enabled` boolean NOT NULL DEFAULT true,
	`map_fallback_mode` varchar(24) NOT NULL DEFAULT 'automatic',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `general_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `help_favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`help_favorite_type` enum('manual','faq') NOT NULL,
	`content_id` varchar(80) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `help_favorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `help_favorites_user_content_unique` UNIQUE(`user_id`,`help_favorite_type`,`content_id`)
);
--> statement-breakpoint
CREATE TABLE `incident_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`incident_id` int NOT NULL,
	`team_id` int NOT NULL,
	`vehicle_id` int,
	`dispatched_by_user_id` int NOT NULL,
	`assignment_status` enum('pendente','aceita','recusada','cancelada','concluida') NOT NULL DEFAULT 'pendente',
	`estimated_arrival_minutes` int,
	`dispatched_at` timestamp NOT NULL DEFAULT (now()),
	`accepted_at` timestamp,
	`declined_at` timestamp,
	`response_note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `incident_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incident_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`incident_id` int NOT NULL,
	`actor_user_id` int,
	`team_id` int,
	`event_type` varchar(80) NOT NULL,
	`previous_status` enum('triagem','aguardando_despacho','despachada','aceita','em_atendimento','pausada','concluida','cancelada'),
	`next_status` enum('triagem','aguardando_despacho','despachada','aceita','em_atendimento','pausada','concluida','cancelada'),
	`message` text NOT NULL,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `incident_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incident_evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`incident_id` int NOT NULL,
	`storage_key` varchar(512) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`content_type` varchar(120) NOT NULL,
	`byte_size` int NOT NULL,
	`description` text,
	`uploaded_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `incident_evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`incident_status` enum('triagem','aguardando_despacho','despachada','aceita','em_atendimento','pausada','concluida','cancelada') NOT NULL DEFAULT 'triagem',
	`incident_priority` enum('baixa','media','alta','critica') NOT NULL DEFAULT 'media',
	`category` varchar(160) NOT NULL,
	`incident_origin` enum('central','telefone','chat','video','sensor','agente','integracao') NOT NULL DEFAULT 'central',
	`requester_name` varchar(200),
	`requester_contact` varchar(80),
	`description` text NOT NULL,
	`address` varchar(500) NOT NULL,
	`latitude` decimal(10,7) NOT NULL,
	`longitude` decimal(10,7) NOT NULL,
	`assigned_team_id` int,
	`assigned_vehicle_id` int,
	`created_by_user_id` int NOT NULL,
	`closed_by_user_id` int,
	`dispatched_at` timestamp,
	`accepted_at` timestamp,
	`started_at` timestamp,
	`completed_at` timestamp,
	`cancelled_at` timestamp,
	`close_summary` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `incidents_id` PRIMARY KEY(`id`),
	CONSTRAINT `incidents_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
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
CREATE TABLE `organizational_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organization_id` int NOT NULL,
	`parent_id` int,
	`organizational_unit_type` enum('organizacao','regional','unidade','departamento','grupo') NOT NULL,
	`code` varchar(48) NOT NULL,
	`name` varchar(200) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizational_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `org_units_org_code_unique` UNIQUE(`organization_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(48) NOT NULL,
	`name` varchar(200) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role_id` int NOT NULL,
	`permission_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `role_permissions_unique` UNIQUE(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `team_locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`team_id` int NOT NULL,
	`user_id` int NOT NULL,
	`latitude` decimal(10,7) NOT NULL,
	`longitude` decimal(10,7) NOT NULL,
	`accuracy_meters` decimal(9,2),
	`speed_meters_per_second` decimal(9,2),
	`heading_degrees` decimal(6,2),
	`captured_at` timestamp NOT NULL,
	`received_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_locations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(160) NOT NULL,
	`agency` varchar(160) NOT NULL,
	`organization_id` int,
	`organizational_unit_id` int,
	`team_status` enum('disponivel','em_deslocamento','em_atendimento','pausada','indisponivel') NOT NULL DEFAULT 'disponivel',
	`shift_started_at` timestamp,
	`shift_ends_at` timestamp,
	`shift_paused_at` timestamp,
	`shift_paused_total_seconds` int NOT NULL DEFAULT 0,
	`last_latitude` decimal(10,7),
	`last_longitude` decimal(10,7),
	`last_location_at` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `teams_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`display_name` varchar(160),
	`employee_id` varchar(80),
	`institutional_id` varchar(80),
	`phone` varchar(40),
	`job_title` varchar(120),
	`avatar_storage_key` varchar(512),
	`avatar_content_type` varchar(120),
	`avatar_updated_at` timestamp,
	`auth_type` varchar(48) NOT NULL DEFAULT 'manus_oauth',
	`mfa_enabled` boolean NOT NULL DEFAULT false,
	`access_expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_profiles_user_unique` UNIQUE(`user_id`),
	CONSTRAINT `user_profiles_employee_unique` UNIQUE(`employee_id`)
);
--> statement-breakpoint
CREATE TABLE `user_role_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`role_id` int NOT NULL,
	`organization_id` int,
	`organizational_unit_id` int,
	`team_id` int,
	`active` boolean NOT NULL DEFAULT true,
	`active_user_id` int,
	`expires_at` timestamp,
	`assigned_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_role_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_roles_active_user_unique` UNIQUE(`active_user_id`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`prefix` varchar(32) NOT NULL,
	`license_plate` varchar(16) NOT NULL,
	`model` varchar(120),
	`type` varchar(80) NOT NULL,
	`vehicle_status` enum('operacional','manutencao','indisponivel') NOT NULL DEFAULT 'operacional',
	`team_id` int,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicles_prefix_unique` UNIQUE(`prefix`),
	CONSTRAINT `vehicles_plate_unique` UNIQUE(`license_plate`)
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
	`retry_of_execution_id` int,
	`queued_at` timestamp NOT NULL DEFAULT (now()),
	`started_at` timestamp,
	`completed_at` timestamp,
	`next_attempt_at` timestamp,
	`initiated_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_executions_id` PRIMARY KEY(`id`),
	CONSTRAINT `workflow_executions_idempotency_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `workflow_executions_retry_source_unique` UNIQUE(`retry_of_execution_id`)
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
ALTER TABLE `users` ADD `operational_role` enum('operador','despachador','agente','supervisor','administrador') DEFAULT 'operador' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `teamId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `active` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `alrt_incoming_events` ADD CONSTRAINT `alrt_incoming_events_created_incident_id_incidents_id_fk` FOREIGN KEY (`created_incident_id`) REFERENCES `incidents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dashboard_saved_filters` ADD CONSTRAINT `dashboard_saved_filters_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dashboard_saved_filters` ADD CONSTRAINT `dashboard_saved_filters_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_incident_reviews` ADD CONSTRAINT `external_incident_reviews_reviewed_by_user_id_users_id_fk` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_incident_reviews` ADD CONSTRAINT `external_incident_reviews_created_incident_id_incidents_id_fk` FOREIGN KEY (`created_incident_id`) REFERENCES `incidents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_incident_reviews` ADD CONSTRAINT `eirev_event_fk` FOREIGN KEY (`incoming_event_id`) REFERENCES `alrt_incoming_events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_incident_reviews` ADD CONSTRAINT `eirev_workflow_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_incident_reviews` ADD CONSTRAINT `eirev_version_fk` FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `faq_suggestions` ADD CONSTRAINT `faq_suggestions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `help_favorites` ADD CONSTRAINT `help_favorites_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_assignments` ADD CONSTRAINT `incident_assignments_incident_id_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_assignments` ADD CONSTRAINT `incident_assignments_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_assignments` ADD CONSTRAINT `incident_assignments_vehicle_id_vehicles_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_assignments` ADD CONSTRAINT `incident_assignments_dispatched_by_user_id_users_id_fk` FOREIGN KEY (`dispatched_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_events` ADD CONSTRAINT `incident_events_incident_id_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_events` ADD CONSTRAINT `incident_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_events` ADD CONSTRAINT `incident_events_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_evidence` ADD CONSTRAINT `incident_evidence_incident_id_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_evidence` ADD CONSTRAINT `incident_evidence_uploaded_by_user_id_users_id_fk` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_assigned_team_id_teams_id_fk` FOREIGN KEY (`assigned_team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_assigned_vehicle_id_vehicles_id_fk` FOREIGN KEY (`assigned_vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_closed_by_user_id_users_id_fk` FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_connections` ADD CONSTRAINT `integration_connections_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_connections` ADD CONSTRAINT `integration_connections_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_credentials` ADD CONSTRAINT `integration_credentials_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_credentials` ADD CONSTRAINT `integration_credentials_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD CONSTRAINT `integration_logs_execution_id_workflow_executions_id_fk` FOREIGN KEY (`execution_id`) REFERENCES `workflow_executions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD CONSTRAINT `integration_logs_workflow_id_workflows_id_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD CONSTRAINT `integration_logs_connection_id_integration_connections_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD CONSTRAINT `integration_logs_webhook_id_integration_webhooks_id_fk` FOREIGN KEY (`webhook_id`) REFERENCES `integration_webhooks`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_openapi_operations` ADD CONSTRAINT `openapi_op_spec_fk` FOREIGN KEY (`spec_id`) REFERENCES `integration_openapi_specs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_openapi_operations` ADD CONSTRAINT `openapi_op_conn_fk` FOREIGN KEY (`generated_connection_id`) REFERENCES `integration_connections`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_openapi_specs` ADD CONSTRAINT `openapi_spec_actor_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_webhooks` ADD CONSTRAINT `integration_webhooks_workflow_id_workflows_id_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_webhooks` ADD CONSTRAINT `integration_webhooks_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_webhooks` ADD CONSTRAINT `integration_webhooks_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organizational_units` ADD CONSTRAINT `organizational_units_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_access_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `access_roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_access_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `access_permissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_locations` ADD CONSTRAINT `team_locations_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_locations` ADD CONSTRAINT `team_locations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teams` ADD CONSTRAINT `teams_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teams` ADD CONSTRAINT `teams_organizational_unit_id_organizational_units_id_fk` FOREIGN KEY (`organizational_unit_id`) REFERENCES `organizational_units`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD CONSTRAINT `user_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_role_id_access_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `access_roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_assigned_by_user_id_users_id_fk` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_roles_unit_fk` FOREIGN KEY (`organizational_unit_id`) REFERENCES `organizational_units`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_execution_steps` ADD CONSTRAINT `workflow_execution_steps_execution_id_workflow_executions_id_fk` FOREIGN KEY (`execution_id`) REFERENCES `workflow_executions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_executions` ADD CONSTRAINT `workflow_executions_workflow_id_workflows_id_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_executions` ADD CONSTRAINT `workflow_executions_workflow_version_id_workflow_versions_id_fk` FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_executions` ADD CONSTRAINT `workflow_executions_initiated_by_user_id_users_id_fk` FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_executions` ADD CONSTRAINT `workflow_execution_retry_fk` FOREIGN KEY (`retry_of_execution_id`) REFERENCES `workflow_executions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_versions` ADD CONSTRAINT `workflow_versions_workflow_id_workflows_id_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_versions` ADD CONSTRAINT `workflow_versions_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflows` ADD CONSTRAINT `workflows_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflows` ADD CONSTRAINT `workflows_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `access_permissions_resource_idx` ON `access_permissions` (`resource`);--> statement-breakpoint
CREATE INDEX `access_roles_active_idx` ON `access_roles` (`active`);--> statement-breakpoint
CREATE INDEX `alrt_incoming_events_status_received_idx` ON `alrt_incoming_events` (`alrt_incoming_event_status`,`received_at`);--> statement-breakpoint
CREATE INDEX `alrt_incoming_events_correlation_idx` ON `alrt_incoming_events` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `audit_resource_created_idx` ON `audit_logs` (`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_actor_created_idx` ON `audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `dashboard_filters_user_default_idx` ON `dashboard_saved_filters` (`user_id`,`is_default`);--> statement-breakpoint
CREATE INDEX `external_incident_reviews_status_created_idx` ON `external_incident_reviews` (`external_incident_review_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `external_incident_reviews_workflow_idx` ON `external_incident_reviews` (`workflow_id`,`external_incident_review_status`);--> statement-breakpoint
CREATE INDEX `faq_suggestions_user_created_idx` ON `faq_suggestions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `faq_suggestions_status_created_idx` ON `faq_suggestions` (`faq_suggestion_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `general_setting_entries_section_idx` ON `general_setting_entries` (`section`,`active`);--> statement-breakpoint
CREATE INDEX `help_favorites_user_created_idx` ON `help_favorites` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `assignments_incident_idx` ON `incident_assignments` (`incident_id`);--> statement-breakpoint
CREATE INDEX `assignments_team_status_idx` ON `incident_assignments` (`team_id`,`assignment_status`);--> statement-breakpoint
CREATE INDEX `events_incident_created_idx` ON `incident_events` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `incident_evidence_incident_created_idx` ON `incident_evidence` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `incident_evidence_uploader_idx` ON `incident_evidence` (`uploaded_by_user_id`);--> statement-breakpoint
CREATE INDEX `incidents_status_priority_idx` ON `incidents` (`incident_status`,`incident_priority`);--> statement-breakpoint
CREATE INDEX `incidents_team_idx` ON `incidents` (`assigned_team_id`);--> statement-breakpoint
CREATE INDEX `incidents_created_at_idx` ON `incidents` (`created_at`);--> statement-breakpoint
CREATE INDEX `integration_connections_active_idx` ON `integration_connections` (`active`,`environment`);--> statement-breakpoint
CREATE INDEX `integration_credentials_active_idx` ON `integration_credentials` (`active`,`environment`);--> statement-breakpoint
CREATE INDEX `integration_event_catalog_source_idx` ON `integration_event_catalog` (`source`,`active`);--> statement-breakpoint
CREATE INDEX `integration_logs_execution_idx` ON `integration_logs` (`execution_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `integration_logs_workflow_created_idx` ON `integration_logs` (`workflow_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `integration_logs_level_created_idx` ON `integration_logs` (`integration_log_level`,`created_at`);--> statement-breakpoint
CREATE INDEX `integration_openapi_operations_spec_idx` ON `integration_openapi_operations` (`spec_id`,`method`);--> statement-breakpoint
CREATE INDEX `integration_openapi_operations_connection_idx` ON `integration_openapi_operations` (`generated_connection_id`);--> statement-breakpoint
CREATE INDEX `integration_openapi_specs_source_idx` ON `integration_openapi_specs` (`source_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `integration_webhooks_workflow_idx` ON `integration_webhooks` (`workflow_id`,`active`);--> statement-breakpoint
CREATE INDEX `org_units_parent_idx` ON `organizational_units` (`parent_id`);--> statement-breakpoint
CREATE INDEX `org_units_type_idx` ON `organizational_units` (`organizational_unit_type`);--> statement-breakpoint
CREATE INDEX `role_permissions_permission_idx` ON `role_permissions` (`permission_id`);--> statement-breakpoint
CREATE INDEX `locations_team_captured_idx` ON `team_locations` (`team_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `locations_user_captured_idx` ON `team_locations` (`user_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `teams_status_idx` ON `teams` (`team_status`);--> statement-breakpoint
CREATE INDEX `teams_org_scope_idx` ON `teams` (`organization_id`,`organizational_unit_id`);--> statement-breakpoint
CREATE INDEX `user_roles_user_active_idx` ON `user_role_assignments` (`user_id`,`active`);--> statement-breakpoint
CREATE INDEX `user_roles_role_idx` ON `user_role_assignments` (`role_id`);--> statement-breakpoint
CREATE INDEX `user_roles_scope_idx` ON `user_role_assignments` (`organization_id`,`organizational_unit_id`,`team_id`);--> statement-breakpoint
CREATE INDEX `vehicles_team_idx` ON `vehicles` (`team_id`);--> statement-breakpoint
CREATE INDEX `workflow_execution_steps_execution_idx` ON `workflow_execution_steps` (`execution_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `workflow_executions_queue_idx` ON `workflow_executions` (`workflow_execution_status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `workflow_executions_workflow_created_idx` ON `workflow_executions` (`workflow_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `workflow_executions_mode_status_idx` ON `workflow_executions` (`workflow_execution_mode`,`workflow_execution_status`);--> statement-breakpoint
CREATE INDEX `workflow_versions_workflow_created_idx` ON `workflow_versions` (`workflow_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `workflows_status_active_idx` ON `workflows` (`workflow_status`,`active`);--> statement-breakpoint
CREATE INDEX `workflows_creator_idx` ON `workflows` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `workflows_updated_idx` ON `workflows` (`updated_at`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_teamId_teams_id_fk` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `users_operational_role_idx` ON `users` (`operational_role`);--> statement-breakpoint
CREATE INDEX `users_team_idx` ON `users` (`teamId`);