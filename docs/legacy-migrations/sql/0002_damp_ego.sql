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
	`team_status` enum('disponivel','em_deslocamento','em_atendimento','pausada','indisponivel') NOT NULL DEFAULT 'disponivel',
	`shift_started_at` timestamp,
	`shift_ends_at` timestamp,
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
ALTER TABLE `users` ADD `operational_role` enum('operador','despachador','agente','supervisor','administrador') DEFAULT 'operador' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `teamId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `active` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_assignments` ADD CONSTRAINT `incident_assignments_incident_id_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_assignments` ADD CONSTRAINT `incident_assignments_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_assignments` ADD CONSTRAINT `incident_assignments_vehicle_id_vehicles_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_assignments` ADD CONSTRAINT `incident_assignments_dispatched_by_user_id_users_id_fk` FOREIGN KEY (`dispatched_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_events` ADD CONSTRAINT `incident_events_incident_id_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_events` ADD CONSTRAINT `incident_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_events` ADD CONSTRAINT `incident_events_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_assigned_team_id_teams_id_fk` FOREIGN KEY (`assigned_team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_assigned_vehicle_id_vehicles_id_fk` FOREIGN KEY (`assigned_vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_closed_by_user_id_users_id_fk` FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_locations` ADD CONSTRAINT `team_locations_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_locations` ADD CONSTRAINT `team_locations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_resource_created_idx` ON `audit_logs` (`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_actor_created_idx` ON `audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `assignments_incident_idx` ON `incident_assignments` (`incident_id`);--> statement-breakpoint
CREATE INDEX `assignments_team_status_idx` ON `incident_assignments` (`team_id`,`assignment_status`);--> statement-breakpoint
CREATE INDEX `events_incident_created_idx` ON `incident_events` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `incidents_status_priority_idx` ON `incidents` (`incident_status`,`incident_priority`);--> statement-breakpoint
CREATE INDEX `incidents_team_idx` ON `incidents` (`assigned_team_id`);--> statement-breakpoint
CREATE INDEX `incidents_created_at_idx` ON `incidents` (`created_at`);--> statement-breakpoint
CREATE INDEX `locations_team_captured_idx` ON `team_locations` (`team_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `locations_user_captured_idx` ON `team_locations` (`user_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `teams_status_idx` ON `teams` (`team_status`);--> statement-breakpoint
CREATE INDEX `vehicles_team_idx` ON `vehicles` (`team_id`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_teamId_teams_id_fk` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `users_operational_role_idx` ON `users` (`operational_role`);--> statement-breakpoint
CREATE INDEX `users_team_idx` ON `users` (`teamId`);