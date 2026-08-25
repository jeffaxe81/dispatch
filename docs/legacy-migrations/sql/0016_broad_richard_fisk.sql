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
ALTER TABLE `alrt_incoming_events` ADD CONSTRAINT `alrt_incoming_events_created_incident_id_incidents_id_fk` FOREIGN KEY (`created_incident_id`) REFERENCES `incidents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `alrt_incoming_events_status_received_idx` ON `alrt_incoming_events` (`alrt_incoming_event_status`,`received_at`);--> statement-breakpoint
CREATE INDEX `alrt_incoming_events_correlation_idx` ON `alrt_incoming_events` (`correlation_id`);