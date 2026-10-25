-- D-012J J26: additive, tenant/system-scoped circuit breaker state.
-- DO NOT execute on a production database without explicit approval.
CREATE TABLE `integration_circuit_state` (
  `id` int AUTO_INCREMENT NOT NULL,
  `organization_id` int NOT NULL,
  `system` enum('neo','inventory','crm') NOT NULL,
  `state` enum('closed','open','half_open') NOT NULL DEFAULT 'closed',
  `circuit_version` int NOT NULL DEFAULT 0,
  `consecutive_failures` int NOT NULL DEFAULT 0,
  `opened_at_ms` bigint unsigned,
  `cooldown_until_ms` bigint unsigned,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `integration_circuit_state_id` PRIMARY KEY(`id`),
  CONSTRAINT `integration_circuit_state_tenant_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_circuit_tenant_system_unique` ON `integration_circuit_state` (`organization_id`,`system`);
--> statement-breakpoint
CREATE INDEX `integration_circuit_state_idx` ON `integration_circuit_state` (`organization_id`,`state`,`cooldown_until_ms`);
