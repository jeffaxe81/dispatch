CREATE TABLE `access_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(120) NOT NULL,
	`resource` varchar(80) NOT NULL,
	`action` varchar(80) NOT NULL,
	`description` text,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `access_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_permissions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `access_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`role_scope` enum('global','organizacao','unidade','departamento','grupo','equipe') NOT NULL DEFAULT 'organizacao',
	`is_system` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `access_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_roles_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `organizational_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organization_id` int NOT NULL,
	`parent_id` int,
	`organizational_unit_type` enum('organizacao','regional','unidade','departamento','grupo') NOT NULL,
	`code` varchar(48) NOT NULL,
	`name` varchar(200) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizational_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `org_units_org_code_unique` UNIQUE(`organization_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(48) NOT NULL,
	`name` varchar(200) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role_id` int NOT NULL,
	`permission_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `role_permissions_unique` UNIQUE(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`display_name` varchar(160),
	`employee_id` varchar(80),
	`institutional_id` varchar(80),
	`phone` varchar(40),
	`job_title` varchar(120),
	`auth_type` varchar(48) NOT NULL DEFAULT 'manus_oauth',
	`mfa_enabled` boolean NOT NULL DEFAULT false,
	`access_expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_profiles_user_unique` UNIQUE(`user_id`),
	CONSTRAINT `user_profiles_employee_unique` UNIQUE(`employee_id`)
);
--> statement-breakpoint
CREATE TABLE `user_role_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`role_id` int NOT NULL,
	`organization_id` int,
	`organizational_unit_id` int,
	`team_id` int,
	`active` boolean NOT NULL DEFAULT true,
	`expires_at` timestamp,
	`assigned_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_role_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `organizational_units` ADD CONSTRAINT `organizational_units_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_access_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `access_roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_access_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `access_permissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD CONSTRAINT `user_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_role_id_access_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `access_roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `fk_ura_org_unit` FOREIGN KEY (`organizational_unit_id`) REFERENCES `organizational_units`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `fk_ura_team` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `fk_ura_assigned_by` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `access_permissions_resource_idx` ON `access_permissions` (`resource`);--> statement-breakpoint
CREATE INDEX `access_roles_active_idx` ON `access_roles` (`active`);--> statement-breakpoint
CREATE INDEX `org_units_parent_idx` ON `organizational_units` (`parent_id`);--> statement-breakpoint
CREATE INDEX `org_units_type_idx` ON `organizational_units` (`organizational_unit_type`);--> statement-breakpoint
CREATE INDEX `role_permissions_permission_idx` ON `role_permissions` (`permission_id`);--> statement-breakpoint
CREATE INDEX `user_roles_user_active_idx` ON `user_role_assignments` (`user_id`,`active`);--> statement-breakpoint
CREATE INDEX `user_roles_role_idx` ON `user_role_assignments` (`role_id`);--> statement-breakpoint
CREATE INDEX `user_roles_scope_idx` ON `user_role_assignments` (`organization_id`,`organizational_unit_id`,`team_id`);
--> statement-breakpoint
INSERT IGNORE INTO `access_permissions` (`code`,`resource`,`action`,`description`,`active`) VALUES ('occurrences.transition','occurrences','transition','Alterar status dentro do ciclo de vida autorizado.',true);
