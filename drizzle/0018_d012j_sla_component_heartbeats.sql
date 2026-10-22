CREATE TABLE `workflow_sla_component_heartbeats` (
  `organization_id` int NOT NULL,
  `component` enum('scheduler','adapter') NOT NULL,
  `source_id` varchar(80) NOT NULL,
  `sequence` bigint unsigned NOT NULL,
  `state` enum('healthy','degraded','unhealthy') NOT NULL,
  `sent_at_ms` bigint unsigned NOT NULL,
  `received_at_ms` bigint unsigned NOT NULL,
  PRIMARY KEY (`organization_id`, `component`),
  CONSTRAINT `workflow_sla_component_heartbeats_organization_fk`
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);
