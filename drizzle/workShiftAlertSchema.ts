import { index, int, json, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { teams, users } from "./schema";
import { workShiftSessions } from "./workShiftSchema";

export const workShiftAlertSeverityEnum = mysqlEnum("work_shift_alert_severity", ["info", "warning", "critical"]);
export const workShiftAlertStatusEnum = mysqlEnum("work_shift_alert_status", ["open", "acknowledged", "resolved"]);

export const workShiftAlerts = mysqlTable(
  "work_shift_alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    type: varchar("type", { length: 64 }).notNull(),
    severity: workShiftAlertSeverityEnum.notNull(),
    status: workShiftAlertStatusEnum.notNull().default("open"),
    dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    sessionId: int("session_id").references(() => workShiftSessions.id, { onDelete: "set null" }),
    detectedAt: timestamp("detected_at").notNull(),
    acknowledgedAt: timestamp("acknowledged_at"),
    acknowledgedByUserId: int("acknowledged_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at"),
    resolvedByUserId: int("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("work_shift_alerts_dedupe_status_idx").on(table.dedupeKey, table.status),
    index("work_shift_alerts_status_detected_idx").on(table.status, table.detectedAt),
    index("work_shift_alerts_detected_idx").on(table.detectedAt),
    index("work_shift_alerts_user_detected_idx").on(table.userId, table.detectedAt),
    index("work_shift_alerts_team_detected_idx").on(table.teamId, table.detectedAt),
    index("work_shift_alerts_session_detected_idx").on(table.sessionId, table.detectedAt),
  ],
);

export type WorkShiftAlert = typeof workShiftAlerts.$inferSelect;
export type InsertWorkShiftAlert = typeof workShiftAlerts.$inferInsert;
