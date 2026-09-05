import {
  boolean,
  foreignKey,
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
  incidentAssignments,
  incidents,
  integrationConnections,
  organizations,
  teamLocations,
  teams,
  users,
} from "./schema";

export const shiftTemplateKindEnum = mysqlEnum("shift_template_kind", ["fixed", "12x36", "custom"]);
export const shiftScheduleStatusEnum = mysqlEnum("shift_schedule_status", [
  "scheduled",
  "active",
  "completed",
  "cancelled",
]);
export const workSessionStatusEnum = mysqlEnum("work_session_status", ["open", "paused", "closed", "adjusted"]);
export const workSessionSourceEnum = mysqlEnum("work_session_source", [
  "manual",
  "schedule",
  "integration",
  "admin_adjustment",
]);
export const workSessionEventTypeEnum = mysqlEnum("work_session_event_type", [
  "start",
  "pause",
  "resume",
  "end",
  "adjustment",
]);
export const operationalPresenceStatusEnum = mysqlEnum("operational_presence_status", [
  "available",
  "busy",
  "paused",
  "offline",
  "out_of_shift",
]);
export const routeTrackStatusEnum = mysqlEnum("route_track_status", ["active", "completed", "cancelled"]);
export const embeddedIntegrationDisplayModeEnum = mysqlEnum("embedded_integration_display_mode", [
  "iframe",
  "external",
]);

export const shiftTemplates = mysqlTable(
  "shift_templates",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull().references(() => organizations.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    kind: shiftTemplateKindEnum.notNull(),
    workMinutes: int("work_minutes").notNull(),
    restMinutes: int("rest_minutes").notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
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
    shiftTemplateId: int("shift_template_id").notNull().references(() => shiftTemplates.id),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    scheduledStartAt: timestamp("scheduled_start_at").notNull(),
    scheduledEndAt: timestamp("scheduled_end_at").notNull(),
    status: shiftScheduleStatusEnum.notNull().default("scheduled"),
    createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("shift_schedules_user_start_idx").on(table.userId, table.scheduledStartAt),
    index("shift_schedules_team_start_idx").on(table.teamId, table.scheduledStartAt),
    index("shift_schedules_template_status_idx").on(table.shiftTemplateId, table.status),
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
    totalPauseSeconds: int("total_pause_seconds").notNull().default(0),
    status: workSessionStatusEnum.notNull().default("open"),
    source: workSessionSourceEnum.notNull().default("manual"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("work_sessions_user_status_started_idx").on(table.userId, table.status, table.startedAt),
    index("work_sessions_team_status_started_idx").on(table.teamId, table.status, table.startedAt),
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
  table => [index("work_session_events_session_occurred_idx").on(table.workSessionId, table.occurredAt)],
);

export const operationalPresence = mysqlTable(
  "operational_presence",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    workSessionId: int("work_session_id").references(() => workSessions.id, { onDelete: "set null" }),
    status: operationalPresenceStatusEnum.notNull().default("out_of_shift"),
    availableForDispatch: boolean("available_for_dispatch").notNull().default(false),
    regionCode: varchar("region_code", { length: 80 }),
    skills: json("skills").$type<string[] | null>(),
    lastChangedAt: timestamp("last_changed_at").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("operational_presence_team_dispatch_status_idx").on(
      table.teamId,
      table.availableForDispatch,
      table.status,
    ),
    index("operational_presence_user_status_idx").on(table.userId, table.status),
  ],
);

export const routeTracks = mysqlTable(
  "route_tracks",
  {
    id: int("id").autoincrement().primaryKey(),
    teamId: int("team_id").notNull().references(() => teams.id),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    incidentId: int("incident_id").references(() => incidents.id, { onDelete: "set null" }),
    assignmentId: int("assignment_id").references(() => incidentAssignments.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    distanceMeters: int("distance_meters"),
    durationSeconds: int("duration_seconds"),
    status: routeTrackStatusEnum.notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("route_tracks_team_status_started_idx").on(table.teamId, table.status, table.startedAt),
    index("route_tracks_incident_assignment_idx").on(table.incidentId, table.assignmentId),
  ],
);

export const routeTrackPoints = mysqlTable(
  "route_track_points",
  {
    id: int("id").autoincrement().primaryKey(),
    routeTrackId: int("route_track_id").notNull().references(() => routeTracks.id, { onDelete: "cascade" }),
    teamLocationId: int("team_location_id").notNull().references(() => teamLocations.id),
    sequence: int("sequence").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("route_track_points_track_sequence_unique").on(table.routeTrackId, table.sequence),
    index("route_track_points_location_idx").on(table.teamLocationId),
  ],
);

export const embeddedIntegrations = mysqlTable(
  "embedded_integrations",
  {
    id: int("id").autoincrement().primaryKey(),
    integrationConnectionId: int("integration_connection_id"),
    code: varchar("code", { length: 100 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    url: varchar("url", { length: 2048 }).notNull(),
    displayMode: embeddedIntegrationDisplayModeEnum.notNull().default("iframe"),
    allowFullscreen: boolean("allow_fullscreen").notNull().default(false),
    enabled: boolean("enabled").notNull().default(false),
    allowedRoles: json("allowed_roles").$type<string[] | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    foreignKey({ name: "embedded_integrations_connection_fk", columns: [table.integrationConnectionId], foreignColumns: [integrationConnections.id] }).onDelete("set null"),
    uniqueIndex("embedded_integrations_code_unique").on(table.code),
    index("embedded_integrations_connection_enabled_idx").on(table.integrationConnectionId, table.enabled),
  ],
);
