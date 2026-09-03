import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import {
  incidents,
  integrationConnections,
  organizations,
  teamLocations,
  teams,
  users,
} from "./schema";

const shiftTemplateKindEnum = mysqlEnum("kind", ["fixed", "12x36", "custom"]);
const shiftScheduleStatusEnum = mysqlEnum("status", ["scheduled", "active", "completed", "cancelled"]);
const workSessionStatusEnum = mysqlEnum("status", ["open", "paused", "closed", "adjusted"]);
const workSessionSourceEnum = mysqlEnum("source", ["manual", "schedule", "integration", "admin_adjustment"]);
const workSessionEventTypeEnum = mysqlEnum("event_type", ["start", "pause", "resume", "end", "adjustment"]);
const operationalPresenceStatusEnum = mysqlEnum("status", ["available", "busy", "paused", "offline", "out_of_shift"]);
const routeTrackStatusEnum = mysqlEnum("status", ["active", "completed", "cancelled"]);
const embeddedIntegrationDisplayModeEnum = mysqlEnum("display_mode", ["embedded", "fullscreen", "split"]);

export const shiftTemplates = mysqlTable(
  "shift_templates",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    kind: shiftTemplateKindEnum.notNull(),
    workMinutes: int("work_minutes").notNull(),
    restMinutes: int("rest_minutes").notNull().default(0),
    timezone: varchar("timezone", { length: 80 }).notNull().default("America/Sao_Paulo"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("shift_templates_org_code_unique").on(table.organizationId, table.code),
    index("shift_templates_org_active_idx").on(table.organizationId, table.active),
  ],
);

export const shiftSchedules = mysqlTable(
  "shift_schedules",
  {
    id: int("id").autoincrement().primaryKey(),
    shiftTemplateId: int("shift_template_id").notNull().references(() => shiftTemplates.id, { onDelete: "restrict" }),
    userId: int("user_id").references(() => users.id, { onDelete: "cascade" }),
    teamId: int("team_id").references(() => teams.id, { onDelete: "cascade" }),
    scheduledStartAt: timestamp("scheduled_start_at").notNull(),
    scheduledEndAt: timestamp("scheduled_end_at").notNull(),
    status: shiftScheduleStatusEnum.notNull().default("scheduled"),
    createdByUserId: int("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("shift_schedules_user_start_idx").on(table.userId, table.scheduledStartAt),
    index("shift_schedules_team_start_idx").on(table.teamId, table.scheduledStartAt),
    index("shift_schedules_status_start_idx").on(table.status, table.scheduledStartAt),
  ],
);

export const workSessions = mysqlTable(
  "work_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    shiftScheduleId: int("shift_schedule_id").references(() => shiftSchedules.id, { onDelete: "set null" }),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    pausedAt: timestamp("paused_at"),
    totalPauseSeconds: int("total_pause_seconds").notNull().default(0),
    status: workSessionStatusEnum.notNull().default("open"),
    source: workSessionSourceEnum.notNull().default("manual"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("work_sessions_user_started_idx").on(table.userId, table.startedAt),
    index("work_sessions_team_started_idx").on(table.teamId, table.startedAt),
    index("work_sessions_status_started_idx").on(table.status, table.startedAt),
  ],
);

export const workSessionEvents = mysqlTable(
  "work_session_events",
  {
    id: int("id").autoincrement().primaryKey(),
    workSessionId: int("work_session_id").notNull().references(() => workSessions.id, { onDelete: "cascade" }),
    eventType: workSessionEventTypeEnum.notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    actorUserId: int("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("work_session_events_session_time_idx").on(table.workSessionId, table.occurredAt)],
);

export const operationalPresence = mysqlTable(
  "operational_presence",
  {
    id: int("id").autoincrement().primaryKey(),
    teamId: int("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    workSessionId: int("work_session_id").references(() => workSessions.id, { onDelete: "set null" }),
    status: operationalPresenceStatusEnum.notNull().default("offline"),
    availableForDispatch: boolean("available_for_dispatch").notNull().default(false),
    currentRegionCode: varchar("current_region_code", { length: 80 }),
    skills: json("skills").$type<string[] | null>(),
    lastLocationId: int("last_location_id").references(() => teamLocations.id, { onDelete: "set null" }),
    lastStatusAt: timestamp("last_status_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("operational_presence_team_unique").on(table.teamId),
    index("operational_presence_dispatch_idx").on(table.availableForDispatch, table.status),
    index("operational_presence_user_idx").on(table.userId),
  ],
);

export const routeTracks = mysqlTable(
  "route_tracks",
  {
    id: int("id").autoincrement().primaryKey(),
    teamId: int("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    incidentId: int("incident_id").references(() => incidents.id, { onDelete: "set null" }),
    workSessionId: int("work_session_id").references(() => workSessions.id, { onDelete: "set null" }),
    status: routeTrackStatusEnum.notNull().default("active"),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    durationSeconds: int("duration_seconds"),
    distanceMeters: int("distance_meters"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("route_tracks_team_started_idx").on(table.teamId, table.startedAt),
    index("route_tracks_incident_idx").on(table.incidentId),
    index("route_tracks_status_idx").on(table.status),
  ],
);

export const routeTrackPoints = mysqlTable(
  "route_track_points",
  {
    id: int("id").autoincrement().primaryKey(),
    routeTrackId: int("route_track_id").notNull().references(() => routeTracks.id, { onDelete: "cascade" }),
    teamLocationId: int("team_location_id").notNull().references(() => teamLocations.id, { onDelete: "restrict" }),
    sequence: int("sequence").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("route_track_points_track_sequence_unique").on(table.routeTrackId, table.sequence),
    uniqueIndex("route_track_points_location_unique").on(table.routeTrackId, table.teamLocationId),
  ],
);

export const embeddedIntegrations = mysqlTable(
  "embedded_integrations",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 100 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    integrationConnectionId: int("integration_connection_id").references(() => integrationConnections.id, { onDelete: "set null" }),
    url: varchar("url", { length: 2048 }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    displayMode: embeddedIntegrationDisplayModeEnum.notNull().default("embedded"),
    allowedRoles: json("allowed_roles").$type<string[]>().notNull(),
    createdByUserId: int("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: int("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("embedded_integrations_code_unique").on(table.code),
    index("embedded_integrations_enabled_idx").on(table.enabled),
  ],
);

export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type ShiftSchedule = typeof shiftSchedules.$inferSelect;
export type WorkSession = typeof workSessions.$inferSelect;
export type OperationalPresence = typeof operationalPresence.$inferSelect;
export type RouteTrack = typeof routeTracks.$inferSelect;
export type EmbeddedIntegration = typeof embeddedIntegrations.$inferSelect;
