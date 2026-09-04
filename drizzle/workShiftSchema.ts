import { index, int, json, mysqlEnum, mysqlTable, timestamp } from "drizzle-orm/mysql-core";
import { users } from "./schema";

export const WORK_SHIFT_STATES = [
  "fora_jornada",
  "em_jornada",
  "em_intervalo",
  "encerrada",
] as const;

export const WORK_SHIFT_EVENT_TYPES = [
  "iniciar",
  "iniciar_intervalo",
  "retomar",
  "encerrar",
  "ajuste",
] as const;

export const workShiftSessions = mysqlTable(
  "work_shift_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id),
    state: mysqlEnum("state", WORK_SHIFT_STATES).notNull().default("fora_jornada"),
    startedAt: timestamp("started_at"),
    breakStartedAt: timestamp("break_started_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("work_shift_sessions_user_state_idx").on(table.userId, table.state),
    index("work_shift_sessions_user_started_idx").on(table.userId, table.startedAt),
  ],
);

export const workShiftEvents = mysqlTable(
  "work_shift_events",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("session_id").notNull().references(() => workShiftSessions.id, { onDelete: "cascade" }),
    userId: int("user_id").notNull().references(() => users.id),
    eventType: mysqlEnum("event_type", WORK_SHIFT_EVENT_TYPES).notNull(),
    previousState: mysqlEnum("previous_state", WORK_SHIFT_STATES),
    nextState: mysqlEnum("next_state", WORK_SHIFT_STATES).notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    actorUserId: int("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [
    index("work_shift_events_session_occurred_idx").on(table.sessionId, table.occurredAt),
    index("work_shift_events_user_occurred_idx").on(table.userId, table.occurredAt),
  ],
);
