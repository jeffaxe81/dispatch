-- D-012J J15: additive integration outbox/DLQ migration.
-- DO NOT execute on a production database without explicit approval.
CREATE TABLE `integration_delivery_outbox` (
  `id` int AUTO_INCREMENT NOT NULL,
  `organization_id` int NOT NULL,
  `system` enum('neo','inventory','crm') NOT NULL,
  `contract_version` int NOT NULL DEFAULT 1,
  `mode` enum('api','event') NOT NULL,
  `operation` varchar(160) NOT NULL,
  `message_id` varchar(160) NOT NULL,
  `idempotency_key` varchar(255) NOT NULL,
  `correlation_id` varchar(160) NOT NULL,
  `status` enum('pending','leased','delivered','dead_letter') NOT NULL DEFAULT 'pending',
  `delivery_version` int NOT NULL DEFAULT 0,
  `delivery_attempts` int NOT NULL DEFAULT 0,
  `max_attempts` int NOT NULL,
  `failure_threshold` int NOT NULL,
  `cooldown_seconds` int NOT NULL,
  `lease_owner` varchar(120),
  `lease_token` varchar(160),
  `lease_expires_at_ms` bigint unsigned,
  `next_attempt_at_ms` bigint unsigned,
  `delivered_at_ms` bigint unsigned,
  `dead_lettered_at_ms` bigint unsigned,
  `payload_reference` varchar(512),
  `last_failure_kind` enum('timeout','unavailable','rate_limited','contract_mismatch','authorization','unknown'),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `integration_delivery_outbox_id` PRIMARY KEY(`id`),
  CONSTRAINT `integration_delivery_outbox_tenant_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_delivery_outbox_tenant_idempotency_unique` ON `integration_delivery_outbox` (`organization_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `integration_delivery_outbox_claim_idx` ON `integration_delivery_outbox` (`organization_id`,`status`,`next_attempt_at_ms`);
--> statement-breakpoint
CREATE INDEX `integration_delivery_outbox_correlation_idx` ON `integration_delivery_outbox` (`organization_id`,`correlation_id`);
