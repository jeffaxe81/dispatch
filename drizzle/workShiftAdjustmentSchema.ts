import { index, int, json, mysqlEnum, mysqlTable, text, timestamp } from "drizzle-orm/mysql-core";
import { users } from "./schema";
import { workShiftSessions } from "./workShiftSchema";

export const workShiftAdjustmentStatusEnum = mysqlEnum("work_shift_adjustment_status", [
  "pending",
  "approved",
  "rejected",
]);

export const workShiftAdjustments = mysqlTable(
  "work_shift_adjustments",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("session_id").notNull().references(() => workShiftSessions.id, { onDelete: "restrict" }),
    requestedByUserId: int("requested_by_user_id").notNull().references(() => users.id),
    decidedByUserId: int("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    status: workShiftAdjustmentStatusEnum.notNull().default("pending"),
    reason: text("reason").notNull(),
    decisionReason: text("decision_reason"),
    requestedChanges: json("requested_changes").$type<Record<string, unknown>>().notNull(),
    beforeSnapshot: json("before_snapshot").$type<Record<string, unknown>>().notNull(),
    afterSnapshot: json("after_snapshot").$type<Record<string, unknown> | null>(),
    requestedAt: timestamp("requested_at").notNull(),
    decidedAt: timestamp("decided_at"),
    appliedAt: timestamp("applied_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("work_shift_adjustments_session_idx").on(table.sessionId),
    index("work_shift_adjustments_status_requested_idx").on(table.status, table.requestedAt),
    index("work_shift_adjustments_requester_idx").on(table.requestedByUserId, table.requestedAt),
  ],
);

export type WorkShiftAdjustment = typeof workShiftAdjustments.$inferSelect;
export type InsertWorkShiftAdjustment = typeof workShiftAdjustments.$inferInsert;
