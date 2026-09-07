CREATE TABLE `workspace_layouts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `user_id` int NOT NULL,
  `name` varchar(80) NOT NULL,
  `layout_version` int NOT NULL DEFAULT 1,
  `layout_json` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `workspace_layouts_id` PRIMARY KEY(`id`),
  CONSTRAINT `workspace_layouts_tenant_user_name_unique` UNIQUE(`tenant_id`,`user_id`,`name`)
);
--> statement-breakpoint
CREATE INDEX `workspace_layouts_tenant_user_idx` ON `workspace_layouts` (`tenant_id`,`user_id`);
