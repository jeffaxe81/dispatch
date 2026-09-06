CREATE TABLE `forms` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `code` varchar(120) NOT NULL,
  `name` varchar(240) NOT NULL,
  `description` text,
  `status` enum('draft','published','inactive') NOT NULL DEFAULT 'draft',
  `organizational_unit_id` int,
  `created_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `forms_id` PRIMARY KEY(`id`),
  CONSTRAINT `forms_tenant_code_unique` UNIQUE(`tenant_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `form_versions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `form_id` int NOT NULL,
  `version` int NOT NULL,
  `definition` json NOT NULL,
  `definition_hash` varchar(64) NOT NULL,
  `status` enum('draft','published','superseded') NOT NULL DEFAULT 'draft',
  `published_by_user_id` int,
  `published_at` timestamp,
  `created_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `form_versions_id` PRIMARY KEY(`id`),
  CONSTRAINT `form_versions_form_version_unique` UNIQUE(`form_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `form_submissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `form_id` int NOT NULL,
  `form_version_id` int NOT NULL,
  `context_type` enum('occurrence','field_order','field_activity'),
  `context_id` varchar(180),
  `responsible_user_id` int,
  `team_id` int,
  `status` enum('not_started','filling','submitted','corrected') NOT NULL DEFAULT 'not_started',
  `answers` json NOT NULL,
  `location` json,
  `submitted_by_user_id` int,
  `submitted_at` timestamp,
  `created_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `form_submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `form_submission_revisions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `submission_id` int NOT NULL,
  `tenant_id` int NOT NULL,
  `revision` int NOT NULL,
  `answers` json NOT NULL,
  `reason` text NOT NULL,
  `actor_user_id` int NOT NULL,
  `before_hash` varchar(64),
  `after_hash` varchar(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `form_submission_revisions_id` PRIMARY KEY(`id`),
  CONSTRAINT `form_submission_revisions_revision_unique` UNIQUE(`submission_id`,`revision`)
);
--> statement-breakpoint
CREATE TABLE `form_attachments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `submission_id` int NOT NULL,
  `revision_id` int,
  `field_key` varchar(120) NOT NULL,
  `storage_key` varchar(512) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `mime_type` varchar(160) NOT NULL,
  `size_bytes` bigint NOT NULL,
  `sha256` varchar(64),
  `created_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `form_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `forms` ADD CONSTRAINT `forms_tenant_id_organizations_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `forms` ADD CONSTRAINT `forms_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `form_versions` ADD CONSTRAINT `form_versions_tenant_id_organizations_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `form_versions` ADD CONSTRAINT `form_versions_form_id_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `form_submissions` ADD CONSTRAINT `form_submissions_tenant_id_organizations_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `form_submissions` ADD CONSTRAINT `form_submissions_form_id_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `form_submissions` ADD CONSTRAINT `form_submissions_form_version_id_form_versions_id_fk` FOREIGN KEY (`form_version_id`) REFERENCES `form_versions`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `form_submission_revisions` ADD CONSTRAINT `form_submission_revisions_submission_id_form_submissions_id_fk` FOREIGN KEY (`submission_id`) REFERENCES `form_submissions`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `form_attachments` ADD CONSTRAINT `form_attachments_submission_id_form_submissions_id_fk` FOREIGN KEY (`submission_id`) REFERENCES `form_submissions`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `form_attachments` ADD CONSTRAINT `form_attachments_revision_id_form_submission_revisions_id_fk` FOREIGN KEY (`revision_id`) REFERENCES `form_submission_revisions`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `forms_tenant_status_idx` ON `forms` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `form_versions_tenant_form_status_idx` ON `form_versions` (`tenant_id`,`form_id`,`status`);
--> statement-breakpoint
CREATE INDEX `form_submissions_tenant_version_idx` ON `form_submissions` (`tenant_id`,`form_version_id`,`status`);
--> statement-breakpoint
CREATE INDEX `form_submissions_context_idx` ON `form_submissions` (`tenant_id`,`context_type`,`context_id`);
--> statement-breakpoint
CREATE INDEX `form_submission_revisions_submission_created_idx` ON `form_submission_revisions` (`submission_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `form_attachments_submission_field_idx` ON `form_attachments` (`submission_id`,`field_key`);
