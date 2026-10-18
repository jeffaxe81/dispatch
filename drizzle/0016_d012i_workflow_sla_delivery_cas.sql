-- I5B: additive migration only. DO NOT execute on a production database without approval.
-- Existing pending rows remain pending (delivery_version=0, delivery_attempts=0).
ALTER TABLE `workflow_sla_event_intents` MODIFY COLUMN `status` enum('pending','leased','delivered','dead_letter') NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `workflow_sla_event_intents` ADD COLUMN `delivery_version` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `workflow_sla_event_intents` ADD COLUMN `delivery_attempts` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `workflow_sla_event_intents` ADD COLUMN `lease_owner` varchar(120);
--> statement-breakpoint
ALTER TABLE `workflow_sla_event_intents` ADD COLUMN `lease_token` varchar(160);
--> statement-breakpoint
ALTER TABLE `workflow_sla_event_intents` ADD COLUMN `lease_expires_at_ms` bigint unsigned;
--> statement-breakpoint
ALTER TABLE `workflow_sla_event_intents` ADD COLUMN `next_attempt_at_ms` bigint unsigned;
--> statement-breakpoint
ALTER TABLE `workflow_sla_event_intents` ADD COLUMN `delivered_at_ms` bigint unsigned;
--> statement-breakpoint
ALTER TABLE `workflow_sla_event_intents` ADD COLUMN `dead_lettered_at_ms` bigint unsigned;
--> statement-breakpoint
ALTER TABLE `workflow_sla_event_intents` ADD COLUMN `last_failure_code` enum('timeout','unavailable','retryable_rejection','permanent_rejection');
--> statement-breakpoint
CREATE INDEX `workflow_sla_intents_claim_idx` ON `workflow_sla_event_intents` (`organization_id`, `status`, `scheduled_at`, `next_attempt_at_ms`);
