import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { workflowTasks } from "./workflowTaskSchema";

export const workflowSlaEventIntents = mysqlTable(
  "workflow_sla_event_intents",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("task_id").notNull().references(() => workflowTasks.id, { onDelete: "cascade" }),
    organizationId: int("organization_id").notNull(),
    workflowVersionId: int("workflow_version_id").notNull(),
    nodeId: varchar("node_id", { length: 120 }).notNull(),
    correlationId: varchar("correlation_id", { length: 160 }).notNull(),
    eventKind: mysqlEnum("event_kind", ["reminder", "overdue", "escalation"]).notNull(),
    eventType: varchar("event_type", { length: 160 }).notNull(),
    escalationMode: mysqlEnum("escalation_mode", ["notify_only", "reassign_task"]),
    scheduledAt: timestamp("scheduled_at").notNull(),
    status: mysqlEnum("status", ["pending", "delivered"]).notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("workflow_sla_intents_task_kind_unique").on(table.taskId, table.eventKind),
    index("workflow_sla_intents_tenant_status_idx").on(table.organizationId, table.status),
  ],
);
