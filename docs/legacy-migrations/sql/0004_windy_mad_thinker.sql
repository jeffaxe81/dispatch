ALTER TABLE `teams` ADD `organization_id` int;--> statement-breakpoint
ALTER TABLE `teams` ADD `organizational_unit_id` int;--> statement-breakpoint
ALTER TABLE `teams` ADD CONSTRAINT `teams_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teams` ADD CONSTRAINT `teams_organizational_unit_id_organizational_units_id_fk` FOREIGN KEY (`organizational_unit_id`) REFERENCES `organizational_units`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `teams_org_scope_idx` ON `teams` (`organization_id`,`organizational_unit_id`);
