import { index, int, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users, workflowExecutions, workflowVersions } from "../../drizzle/schema";

export const workflowTaskStatusEnum = mysqlEnum("workflow_task_status", [
  "open",
  "in_progress",
  "completed",
  "cancelled",
]);

export const workflowTasks = mysqlTable(
  "workflow_tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    executionId: int("execution_id").notNull().references(() => workflowExecutions.id, { onDelete: "cascade" }),
    workflowVersionId: int("workflow_version_id").notNull().references(() => workflowVersions.id, { onDelete: "restrict" }),
    nodeId: varchar("node_id", { length: 120 }).notNull(),
    status: workflowTaskStatusEnum.notNull().default("open"),
    assigneeUserId: int("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: int("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    claimedAt: timestamp("claimed_at"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("workflow_tasks_execution_node_unique").on(table.executionId, table.nodeId),
    index("workflow_tasks_assignee_status_idx").on(table.assigneeUserId, table.status),
    index("workflow_tasks_execution_status_idx").on(table.executionId, table.status),
  ],
);
