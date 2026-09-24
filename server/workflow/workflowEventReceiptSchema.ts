import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { workflowExecutions } from "../../drizzle/schema";

export const workflowEventReceiptStatusEnum = mysqlEnum("status", [
  "pending",
  "processed",
  "ignored",
  "failed",
]);

export const workflowEventReceipts = mysqlTable(
  "workflow_event_receipts",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: varchar("tenant_id", { length: 128 }).notNull(),
    eventId: varchar("event_id", { length: 160 }).notNull(),
    eventType: varchar("event_type", { length: 160 }).notNull(),
    producer: varchar("producer", { length: 80 }).notNull(),
    correlationId: varchar("correlation_id", { length: 160 }).notNull(),
    status: workflowEventReceiptStatusEnum.notNull().default("pending"),
    workflowExecutionId: int("workflow_execution_id").references(() => workflowExecutions.id, {
      onDelete: "set null",
    }),
    failureCode: varchar("failure_code", { length: 160 }),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("workflow_event_receipts_tenant_event_unique").on(table.tenantId, table.eventId),
    index("workflow_event_receipts_status_created_idx").on(table.status, table.createdAt),
    index("workflow_event_receipts_correlation_idx").on(table.correlationId),
  ],
);