CREATE TABLE `incident_evidence_upload_attempts` (
  `attempt_id` varchar(36) NOT NULL,
  `storage_key` varchar(512) NOT NULL,
  `incident_id` int NOT NULL,
  `actor_user_id` int NOT NULL,
  `team_id` int NOT NULL,
  `state` enum('reserved','committed','cleanup_required') NOT NULL DEFAULT 'reserved',
  `evidence_id` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `incident_evidence_upload_attempts_attempt_id` PRIMARY KEY(`attempt_id`),
  CONSTRAINT `incident_evidence_upload_attempts_storage_key_unique` UNIQUE(`storage_key`)
);
--> statement-breakpoint
CREATE INDEX `incident_evidence_upload_state_updated_idx` ON `incident_evidence_upload_attempts` (`state`, `updated_at`);
--> statement-breakpoint
CREATE INDEX `incident_evidence_upload_incident_idx` ON `incident_evidence_upload_attempts` (`incident_id`);
--> statement-breakpoint
CREATE INDEX `incident_evidence_storage_key_idx` ON `incident_evidence` (`storage_key`);
