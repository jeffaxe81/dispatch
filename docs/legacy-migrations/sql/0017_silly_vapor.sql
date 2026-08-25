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
ALTER TABLE `external_incident_reviews` ADD CONSTRAINT `eirev_event_fk` FOREIGN KEY (`incoming_event_id`) REFERENCES `alrt_incoming_events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_incident_reviews` ADD CONSTRAINT `eirev_workflow_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_incident_reviews` ADD CONSTRAINT `eirev_version_fk` FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_incident_reviews` ADD CONSTRAINT `eirev_reviewer_fk` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_incident_reviews` ADD CONSTRAINT `eirev_incident_fk` FOREIGN KEY (`created_incident_id`) REFERENCES `incidents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `external_incident_reviews_status_created_idx` ON `external_incident_reviews` (`external_incident_review_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `external_incident_reviews_workflow_idx` ON `external_incident_reviews` (`workflow_id`,`external_incident_review_status`);
