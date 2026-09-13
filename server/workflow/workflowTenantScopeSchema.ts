import { index, int, mysqlTable, timestamp } from "drizzle-orm/mysql-core";
import { organizations, workflowExecutions, workflows } from "../../drizzle/schema";

export const workflowTenantScopes = mysqlTable(
  "workflow_tenant_scopes",
  {
    workflowId: int("workflow_id").primaryKey().references(() => workflows.id, { onDelete: "cascade" }),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("workflow_tenant_scopes_org_idx").on(table.organizationId)],
);

export const workflowExecutionTenantScopes = mysqlTable(
  "workflow_execution_tenant_scopes",
  {
    executionId: int("execution_id").primaryKey().references(() => workflowExecutions.id, { onDelete: "cascade" }),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("workflow_execution_tenant_scopes_org_idx").on(table.organizationId)],
);
