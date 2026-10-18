import {
  bigint,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { organizations, workflowVersions } from "../../drizzle/schema";
import { workflowSlaEventIntents } from "./workflowSlaEventIntentSchema";
import { workflowTasks } from "./workflowTaskSchema";

/** Durable internal inbox and acceptance receipt; contains no destination, token or message body. */
export const workflowSlaNotifications = mysqlTable(
  "workflow_sla_notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    intentId: int("intent_id").notNull(),
    organizationId: int("organization_id").notNull(),
    taskId: int("task_id").notNull(),
    workflowVersionId: int("workflow_version_id").notNull(),
    nodeId: varchar("node_id", { length: 120 }).notNull(),
    correlationId: varchar("correlation_id", { length: 160 }).notNull(),
    eventKind: mysqlEnum("event_kind", [
      "reminder",
      "overdue",
      "escalation",
    ]).notNull(),
    eventKey: varchar("event_key", { length: 160 }).notNull(),
    scheduledAtMs: bigint("scheduled_at_ms", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    acceptedAtMs: bigint("accepted_at_ms", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    deliveryVersion: int("delivery_version").notNull(),
  },
  table => [
    foreignKey({
      name: "workflow_sla_notifications_intent_fk",
      columns: [table.intentId],
      foreignColumns: [workflowSlaEventIntents.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "workflow_sla_notifications_tenant_fk",
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "workflow_sla_notifications_task_fk",
      columns: [table.taskId],
      foreignColumns: [workflowTasks.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "workflow_sla_notifications_version_fk",
      columns: [table.workflowVersionId],
      foreignColumns: [workflowVersions.id],
    }).onDelete("restrict"),
    uniqueIndex("workflow_sla_notifications_intent_unique").on(table.intentId),
    uniqueIndex("workflow_sla_notifications_tenant_event_unique").on(
      table.organizationId,
      table.eventKey
    ),
    index("workflow_sla_notifications_tenant_time_idx").on(
      table.organizationId,
      table.acceptedAtMs
    ),
  ]
);
