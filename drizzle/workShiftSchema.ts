import { boolean, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { organizations, organizationalUnits, teams, users } from "./schema";

export const workShiftSessionStatusEnum = mysqlEnum("work_shift_session_status", ["active", "paused", "ended", "cancelled"]);
export const workShiftSourceEnum = mysqlEnum("work_shift_source", ["self", "supervisor", "admin", "migration", "system"]);
export const workShiftScheduleTypeEnum = mysqlEnum("work_shift_schedule_type", ["fixed", "cyclic_12x36", "custom_cycle"]);
export const workShiftScheduleExceptionTypeEnum = mysqlEnum("work_shift_schedule_exception_type", ["day_off", "replacement_shift", "leave", "extra_call", "holiday_override"]);

export const workShiftSchedules = mysqlTable(
  "work_shift_schedules",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    organizationId: int("organization_id").notNull().references(() => organizations.id),
    organizationalUnitId: int("organizational_unit_id").references(() => organizationalUnits.id, { onDelete: "set null" }),
    scheduleType: workShiftScheduleTypeEnum.notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    startTimeLocal: varchar("start_time_local", { length: 5 }).notNull(),
    weekdays: json("weekdays").$type<number[] | null>(),
    plannedDurationMinutes: int("planned_duration_minutes").notNull(),
    breakPolicyMinutes: int("break_policy_minutes"),
    cycleAnchorAt: timestamp("cycle_anchor_at"),
    cycleWorkMinutes: int("cycle_work_minutes"),
    cycleRestMinutes: int("cycle_rest_minutes"),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveUntil: timestamp("effective_until"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("work_shift_schedules_org_code_unique").on(table.organizationId, table.code),
    index("work_shift_schedules_scope_idx").on(table.organizationId, table.organizationalUnitId, table.active),
    index("work_shift_schedules_effective_idx").on(table.effectiveFrom, table.effectiveUntil),
  ],
);

export const workShiftAssignments = mysqlTable(
  "work_shift_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    scheduleId: int("schedule_id").notNull().references(() => workShiftSchedules.id, { onDelete: "restrict" }),
    userId: int("user_id").notNull().references(() => users.id),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveUntil: timestamp("effective_until"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("work_shift_assignments_user_effective_idx").on(table.userId, table.active, table.effectiveFrom, table.effectiveUntil),
    index("work_shift_assignments_schedule_idx").on(table.scheduleId, table.active),
    index("work_shift_assignments_team_idx").on(table.teamId, table.active),
  ],
);

export const workShiftScheduleExceptions = mysqlTable(
  "work_shift_schedule_exceptions",
  {
    id: int("id").autoincrement().primaryKey(),
    assignmentId: int("assignment_id").notNull().references(() => workShiftAssignments.id, { onDelete: "restrict" }),
    exceptionType: workShiftScheduleExceptionTypeEnum.notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    reason: text("reason"),
    createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("work_shift_schedule_exceptions_assignment_start_idx").on(table.assignmentId, table.startsAt)],
);

export const workShiftSessions = mysqlTable(
  "work_shift_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    scheduleAssignmentId: int("schedule_assignment_id").references(() => workShiftAssignments.id, { onDelete: "set null" }),
    scheduledStartAt: timestamp("scheduled_start_at"),
    scheduledEndAt: timestamp("scheduled_end_at"),
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
    index("work_shift_sessions_schedule_assignment_idx").on(table.scheduleAssignmentId),
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

export type WorkShiftSchedule = typeof workShiftSchedules.$inferSelect;
export type InsertWorkShiftSchedule = typeof workShiftSchedules.$inferInsert;
export type WorkShiftAssignment = typeof workShiftAssignments.$inferSelect;
export type InsertWorkShiftAssignment = typeof workShiftAssignments.$inferInsert;
export type WorkShiftScheduleException = typeof workShiftScheduleExceptions.$inferSelect;
export type InsertWorkShiftScheduleException = typeof workShiftScheduleExceptions.$inferInsert;
export type WorkShiftSession = typeof workShiftSessions.$inferSelect;
export type InsertWorkShiftSession = typeof workShiftSessions.$inferInsert;
export type WorkShiftEvent = typeof workShiftEvents.$inferSelect;
