import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { teams, users } from "./schema";

export const workShiftSessionStatusEnum = mysqlEnum("work_shift_session_status", ["active", "paused", "ended", "cancelled"]);
export const workShiftSourceEnum = mysqlEnum("work_shift_source", ["self", "supervisor", "admin", "migration", "system"]);

export const workShiftSessions = mysqlTable(
  "work_shift_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at").notNull(),
    pausedAt: timestamp("paused_at"),
    endedAt: timestamp("ended_at"),
    status: workShiftSessionStatusEnum.notNull(),
    workedSeconds: int("worked_seconds").notNull().default(0),
    pausedSeconds: int("paused_seconds").notNull().default(0),
    overtimeSeconds: int("overtime_seconds").notNull().default(0),
    lateStartSeconds: int("late_start_seconds").notNull().default(0),
    earlyEndSeconds: int("early_end_seconds").notNull().default(0),
    source: workShiftSourceEnum.notNull().default("self"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("work_shift_sessions_user_started_idx").on(table.userId, table.startedAt),
    index("work_shift_sessions_user_status_idx").on(table.userId, table.status),
    index("work_shift_sessions_team_started_idx").on(table.teamId, table.startedAt),
  ],
);

export const workShiftEvents = mysqlTable(
  "work_shift_events",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("session_id").notNull().references(() => workShiftSessions.id, { onDelete: "restrict" }),
    eventType: varchar("event_type", { length: 48 }).notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    actorUserId: int("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    beforeData: json("before_data").$type<Record<string, unknown> | null>(),
    afterData: json("after_data").$type<Record<string, unknown> | null>(),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("work_shift_events_session_occurred_idx").on(table.sessionId, table.occurredAt)],
);

export type WorkShiftSession = typeof workShiftSessions.$inferSelect;
export type InsertWorkShiftSession = typeof workShiftSessions.$inferInsert;
export type WorkShiftEvent = typeof workShiftEvents.$inferSelect;
