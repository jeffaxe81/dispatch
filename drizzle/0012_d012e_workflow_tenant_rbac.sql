CREATE TABLE `workflow_tenant_scopes` (
  `workflow_id` int NOT NULL,
  `organization_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `workflow_tenant_scopes_workflow_pk` PRIMARY KEY(`workflow_id`),
  CONSTRAINT `workflow_tenant_scopes_workflow_fk` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE CASCADE,
  CONSTRAINT `workflow_tenant_scopes_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `workflow_tenant_scopes_org_idx` ON `workflow_tenant_scopes` (`organization_id`);
--> statement-breakpoint
CREATE TABLE `workflow_execution_tenant_scopes` (
  `execution_id` int NOT NULL,
  `organization_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `workflow_execution_tenant_scopes_execution_pk` PRIMARY KEY(`execution_id`),
  CONSTRAINT `workflow_execution_tenant_scopes_execution_fk` FOREIGN KEY (`execution_id`) REFERENCES `workflow_executions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `workflow_execution_tenant_scopes_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `workflow_execution_tenant_scopes_org_idx` ON `workflow_execution_tenant_scopes` (`organization_id`);
--> statement-breakpoint
INSERT IGNORE INTO `workflow_tenant_scopes` (`workflow_id`, `organization_id`)
SELECT
  w.id,
  MIN(ura.organization_id)
FROM `workflows` w
JOIN `user_role_assignments` ura
  ON ura.user_id = w.created_by_user_id
 AND ura.active = 1
 AND ura.organization_id IS NOT NULL
GROUP BY w.id
HAVING COUNT(DISTINCT ura.organization_id) = 1;
--> statement-breakpoint
INSERT IGNORE INTO `workflow_execution_tenant_scopes` (`execution_id`, `organization_id`)
SELECT
  e.id,
  s.organization_id
FROM `workflow_executions` e
JOIN `workflow_tenant_scopes` s ON s.workflow_id = e.workflow_id;
