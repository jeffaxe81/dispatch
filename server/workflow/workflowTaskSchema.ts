import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { teams, users, workflowExecutions } from "../../drizzle/schema";

export const workflowTaskStatusEnum = mysqlEnum("workflow_task_status", [
  "open",
  "in_progress",
  "completed",
  "cancelled",
]);

export const workflowTaskAssignmentTypeEnum = mysqlEnum("workflow_task_assignment_type", [
  "user",
  "team",
  "role",
]);

export const workflowTasks = mysqlTable(
  "workflow_tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    executionId: int("execution_id").notNull().references(() => workflowExecutions.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id", { length: 120 }).notNull(),
    status: workflowTaskStatusEnum.notNull().default("open"),
    assignmentType: workflowTaskAssignmentTypeEnum.notNull(),
    assigneeUserId: int("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    assigneeTeamId: int("assignee_team_id").references(() => teams.id, { onDelete: "set null" }),
    assigneeRole: varchar("assignee_role", { length: 48 }),
    claimedByUserId: int("claimed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    correlationId: varchar("correlation_id", { length: 160 }).notNull(),
    claimedAt: timestamp("claimed_at"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("workflow_tasks_execution_node_unique").on(table.executionId, table.nodeId),
    index("workflow_tasks_execution_idx").on(table.executionId),
    index("workflow_tasks_status_idx").on(table.status, table.createdAt),
    index("workflow_tasks_assignment_idx").on(
      table.assignmentType,
      table.assigneeUserId,
      table.assigneeTeamId,
      table.assigneeRole,
      table.status,
    ),
    index("workflow_tasks_claimed_by_idx").on(table.claimedByUserId, table.status),
  ],
);

export const workflowTaskEvents = mysqlTable(
  "workflow_task_events",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("task_id").notNull().references(() => workflowTasks.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 48 }).notNull(),
    actorUserId: int("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    beforeData: json("before_data").$type<Record<string, unknown> | null>(),
    afterData: json("after_data").$type<Record<string, unknown> | null>(),
    correlationId: varchar("correlation_id", { length: 160 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("workflow_task_events_task_created_idx").on(table.taskId, table.createdAt)],
);
