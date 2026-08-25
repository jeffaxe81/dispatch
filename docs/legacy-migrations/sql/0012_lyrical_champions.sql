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
ALTER TABLE `incident_evidence` ADD CONSTRAINT `incident_evidence_incident_id_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incident_evidence` ADD CONSTRAINT `incident_evidence_uploaded_by_user_id_users_id_fk` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `incident_evidence_incident_created_idx` ON `incident_evidence` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `incident_evidence_uploader_idx` ON `incident_evidence` (`uploaded_by_user_id`);--> statement-breakpoint
