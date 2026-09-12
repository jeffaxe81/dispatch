CREATE TABLE `incident_tenant_scopes` (
  `incident_id` int NOT NULL,
  `organization_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `incident_tenant_scopes_incident_id` PRIMARY KEY(`incident_id`)
);
--> statement-breakpoint
CREATE INDEX `incident_tenant_scopes_org_idx` ON `incident_tenant_scopes` (`organization_id`);
--> statement-breakpoint
ALTER TABLE `incident_tenant_scopes` ADD CONSTRAINT `incident_tenant_scopes_incident_id_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `incident_tenant_scopes` ADD CONSTRAINT `incident_tenant_scopes_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict;
--> statement-breakpoint
CREATE TABLE `vehicle_tenant_scopes` (
  `vehicle_id` int NOT NULL,
  `organization_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vehicle_tenant_scopes_vehicle_id` PRIMARY KEY(`vehicle_id`)
);
--> statement-breakpoint
CREATE INDEX `vehicle_tenant_scopes_org_idx` ON `vehicle_tenant_scopes` (`organization_id`);
--> statement-breakpoint
ALTER TABLE `vehicle_tenant_scopes` ADD CONSTRAINT `vehicle_tenant_scopes_vehicle_id_vehicles_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `vehicle_tenant_scopes` ADD CONSTRAINT `vehicle_tenant_scopes_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict;
--> statement-breakpoint

-- Backfill seguro: ocorrências já vinculadas a uma equipe com organização conhecida.
INSERT IGNORE INTO `incident_tenant_scopes` (`incident_id`, `organization_id`)
SELECT i.`id`, t.`organization_id`
FROM `incidents` i
JOIN `teams` t ON t.`id` = i.`assigned_team_id`
WHERE t.`organization_id` IS NOT NULL;
--> statement-breakpoint

-- Backfill complementar: ocorrência sem equipe atribuída, mas criada por usuário cuja equipe possui organização conhecida.
INSERT IGNORE INTO `incident_tenant_scopes` (`incident_id`, `organization_id`)
SELECT i.`id`, t.`organization_id`
FROM `incidents` i
JOIN `users` u ON u.`id` = i.`created_by_user_id`
JOIN `teams` t ON t.`id` = u.`teamId`
WHERE t.`organization_id` IS NOT NULL;
--> statement-breakpoint

-- Viaturas só são migradas automaticamente quando a equipe determina a organização sem ambiguidade.
INSERT IGNORE INTO `vehicle_tenant_scopes` (`vehicle_id`, `organization_id`)
SELECT v.`id`, t.`organization_id`
FROM `vehicles` v
JOIN `teams` t ON t.`id` = v.`team_id`
WHERE t.`organization_id` IS NOT NULL;
