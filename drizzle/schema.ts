import {
  boolean,
  decimal,
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

export const baseRoleEnum = mysqlEnum("role", ["user", "admin"]);
export const operationalRoleEnum = mysqlEnum("operational_role", ["operador", "despachador", "agente", "supervisor", "administrador"]);
export const teamStatusEnum = mysqlEnum("team_status", ["disponivel", "em_deslocamento", "em_atendimento", "pausada", "indisponivel"]);
export const vehicleStatusEnum = mysqlEnum("vehicle_status", ["operacional", "manutencao", "indisponivel"]);
const incidentStatusValues = ["triagem", "aguardando_despacho", "despachada", "aceita", "em_atendimento", "pausada", "concluida", "cancelada"] as const;
export const incidentStatusEnum = mysqlEnum("incident_status", incidentStatusValues);
export const incidentPriorityEnum = mysqlEnum("incident_priority", ["baixa", "media", "alta", "critica"]);
export const incidentOriginEnum = mysqlEnum("incident_origin", ["central", "telefone", "chat", "video", "sensor", "agente", "integracao"]);
export const assignmentStatusEnum = mysqlEnum("assignment_status", ["pendente", "aceita", "recusada", "cancelada", "concluida"]);
export const organizationalUnitTypeEnum = mysqlEnum("organizational_unit_type", ["organizacao", "regional", "unidade", "departamento", "grupo"]);
export const roleScopeEnum = mysqlEnum("role_scope", ["global", "organizacao", "unidade", "departamento", "grupo", "equipe"]);
export const workflowStatusEnum = mysqlEnum("workflow_status", ["rascunho", "publicado", "arquivado"]);
export const workflowExecutionStatusEnum = mysqlEnum("workflow_execution_status", ["pendente", "em_execucao", "concluida", "falha", "dead_letter", "cancelada"]);
export const workflowExecutionModeEnum = mysqlEnum("workflow_execution_mode", ["simulacao", "producao"]);
export const integrationLogLevelEnum = mysqlEnum("integration_log_level", ["info", "sucesso", "aviso", "erro"]);
export const helpFavoriteTypeEnum = mysqlEnum("help_favorite_type", ["manual", "faq"]);
export const faqSuggestionStatusEnum = mysqlEnum("faq_suggestion_status", ["pendente", "avaliada", "publicada", "recusada"]);
export const alrtIncomingEventStatusEnum = mysqlEnum("alrt_incoming_event_status", ["recebido", "validado", "rejeitado", "processado"]);
export const externalIncidentReviewStatusEnum = mysqlEnum("external_incident_review_status", ["pendente", "confirmada", "descartada"]);

export const teams = mysqlTable(
  "teams",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    agency: varchar("agency", { length: 160 }).notNull(),
    organizationId: int("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    organizationalUnitId: int("organizational_unit_id").references(() => organizationalUnits.id, { onDelete: "set null" }),
    status: teamStatusEnum.notNull().default("disponivel"),
    shiftStartedAt: timestamp("shift_started_at"),
    shiftEndsAt: timestamp("shift_ends_at"),
    shiftPausedAt: timestamp("shift_paused_at"),
    shiftPausedTotalSeconds: int("shift_paused_total_seconds").notNull().default(0),
    lastLatitude: decimal("last_latitude", { precision: 10, scale: 7 }),
    lastLongitude: decimal("last_longitude", { precision: 10, scale: 7 }),
    lastLocationAt: timestamp("last_location_at"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("teams_code_unique").on(table.code), index("teams_status_idx").on(table.status), index("teams_org_scope_idx").on(table.organizationId, table.organizationalUnitId)],
);

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: baseRoleEnum.notNull().default("user"),
    operationalRole: operationalRoleEnum.notNull().default("operador"),
    teamId: int("teamId").references(() => teams.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [index("users_operational_role_idx").on(table.operationalRole), index("users_team_idx").on(table.teamId)],
);

export const vehicles = mysqlTable(
  "vehicles",
  {
    id: int("id").autoincrement().primaryKey(),
    prefix: varchar("prefix", { length: 32 }).notNull(),
    licensePlate: varchar("license_plate", { length: 16 }).notNull(),
    model: varchar("model", { length: 120 }),
    type: varchar("type", { length: 80 }).notNull(),
    status: vehicleStatusEnum.notNull().default("operacional"),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("vehicles_prefix_unique").on(table.prefix),
    uniqueIndex("vehicles_plate_unique").on(table.licensePlate),
    index("vehicles_team_idx").on(table.teamId),
  ],
);

export const incidents = mysqlTable(
  "incidents",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    status: incidentStatusEnum.notNull().default("triagem"),
    priority: incidentPriorityEnum.notNull().default("media"),
    category: varchar("category", { length: 160 }).notNull(),
    origin: incidentOriginEnum.notNull().default("central"),
    requesterName: varchar("requester_name", { length: 200 }),
    requesterContact: varchar("requester_contact", { length: 80 }),
    description: text("description").notNull(),
    address: varchar("address", { length: 500 }).notNull(),
    latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
    assignedTeamId: int("assigned_team_id").references(() => teams.id, { onDelete: "set null" }),
    assignedVehicleId: int("assigned_vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
    closedByUserId: int("closed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    dispatchedAt: timestamp("dispatched_at"),
    acceptedAt: timestamp("accepted_at"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    closeSummary: text("close_summary"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("incidents_code_unique").on(table.code),
    index("incidents_status_priority_idx").on(table.status, table.priority),
    index("incidents_team_idx").on(table.assignedTeamId),
    index("incidents_created_at_idx").on(table.createdAt),
  ],
);

export const incidentAssignments = mysqlTable(
  "incident_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    incidentId: int("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    teamId: int("team_id").notNull().references(() => teams.id),
    vehicleId: int("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    dispatchedByUserId: int("dispatched_by_user_id").notNull().references(() => users.id),
    status: assignmentStatusEnum.notNull().default("pendente"),
    estimatedArrivalMinutes: int("estimated_arrival_minutes"),
    dispatchedAt: timestamp("dispatched_at").defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at"),
    declinedAt: timestamp("declined_at"),
    responseNote: text("response_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("assignments_incident_idx").on(table.incidentId), index("assignments_team_status_idx").on(table.teamId, table.status)],
);

export const incidentEvidence = mysqlTable(
  "incident_evidence",
  {
    id: int("id").autoincrement().primaryKey(),
    incidentId: int("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 120 }).notNull(),
    byteSize: int("byte_size").notNull(),
    description: text("description"),
    uploadedByUserId: int("uploaded_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("incident_evidence_incident_created_idx").on(table.incidentId, table.createdAt), index("incident_evidence_uploader_idx").on(table.uploadedByUserId)],
);

export const teamLocations = mysqlTable(
  "team_locations",
  {
    id: int("id").autoincrement().primaryKey(),
    teamId: int("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: int("user_id").notNull().references(() => users.id),
    latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
    accuracyMeters: decimal("accuracy_meters", { precision: 9, scale: 2 }),
    speedMetersPerSecond: decimal("speed_meters_per_second", { precision: 9, scale: 2 }),
    headingDegrees: decimal("heading_degrees", { precision: 6, scale: 2 }),
    capturedAt: timestamp("captured_at").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
  },
  table => [index("locations_team_captured_idx").on(table.teamId, table.capturedAt), index("locations_user_captured_idx").on(table.userId, table.capturedAt)],
);

export const incidentEvents = mysqlTable(
  "incident_events",
  {
    id: int("id").autoincrement().primaryKey(),
    incidentId: int("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    actorUserId: int("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    previousStatus: mysqlEnum("previous_status", incidentStatusValues),
    nextStatus: mysqlEnum("next_status", incidentStatusValues),
    message: text("message").notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("events_incident_created_idx").on(table.incidentId, table.createdAt)],
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    resourceId: int("resource_id").notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    actorUserId: int("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    beforeData: json("before_data").$type<Record<string, unknown> | null>(),
    afterData: json("after_data").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("audit_resource_created_idx").on(table.resourceType, table.resourceId, table.createdAt), index("audit_actor_created_idx").on(table.actorUserId, table.createdAt)],
);

export const organizations = mysqlTable(
  "organizations",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 48 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("organizations_code_unique").on(table.code)],
);

export const organizationalUnits = mysqlTable(
  "organizational_units",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull().references(() => organizations.id),
    parentId: int("parent_id"),
    type: organizationalUnitTypeEnum.notNull(),
    code: varchar("code", { length: 48 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("org_units_org_code_unique").on(table.organizationId, table.code), index("org_units_parent_idx").on(table.parentId), index("org_units_type_idx").on(table.type)],
);

export const accessRoles = mysqlTable(
  "access_roles",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    defaultScope: roleScopeEnum.notNull().default("organizacao"),
    isSystem: boolean("is_system").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("access_roles_code_unique").on(table.code), index("access_roles_active_idx").on(table.active)],
);

export const accessPermissions = mysqlTable(
  "access_permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 120 }).notNull(),
    resource: varchar("resource", { length: 80 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("access_permissions_code_unique").on(table.code), index("access_permissions_resource_idx").on(table.resource)],
);

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    roleId: int("role_id").notNull().references(() => accessRoles.id, { onDelete: "cascade" }),
    permissionId: int("permission_id").notNull().references(() => accessPermissions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [uniqueIndex("role_permissions_unique").on(table.roleId, table.permissionId), index("role_permissions_permission_idx").on(table.permissionId)],
);

export const userRoleAssignments = mysqlTable(
  "user_role_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: int("role_id").notNull().references(() => accessRoles.id, { onDelete: "cascade" }),
    organizationId: int("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    organizationalUnitId: int("organizational_unit_id"),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    activeUserId: int("active_user_id"),
    expiresAt: timestamp("expires_at"),
    assignedByUserId: int("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.organizationalUnitId], foreignColumns: [organizationalUnits.id], name: "user_roles_unit_fk" }).onDelete("set null"),
    uniqueIndex("user_roles_active_user_unique").on(table.activeUserId),
    index("user_roles_user_active_idx").on(table.userId, table.active),
    index("user_roles_role_idx").on(table.roleId),
    index("user_roles_scope_idx").on(table.organizationId, table.organizationalUnitId, table.teamId),
  ],
);

export const userProfiles = mysqlTable(
  "user_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 160 }),
    employeeId: varchar("employee_id", { length: 80 }),
    institutionalId: varchar("institutional_id", { length: 80 }),
    phone: varchar("phone", { length: 40 }),
    jobTitle: varchar("job_title", { length: 120 }),
    avatarStorageKey: varchar("avatar_storage_key", { length: 512 }),
    avatarContentType: varchar("avatar_content_type", { length: 120 }),
    avatarUpdatedAt: timestamp("avatar_updated_at"),
    authType: varchar("auth_type", { length: 48 }).notNull().default("manus_oauth"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    accessExpiresAt: timestamp("access_expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("user_profiles_user_unique").on(table.userId), uniqueIndex("user_profiles_employee_unique").on(table.employeeId)],
);

export const dashboardSavedFilters = mysqlTable(
  "dashboard_saved_filters",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("dashboard_filters_user_name_unique").on(table.userId, table.name), index("dashboard_filters_user_default_idx").on(table.userId, table.isDefault)],
);

export const helpFavorites = mysqlTable(
  "help_favorites",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    contentType: helpFavoriteTypeEnum.notNull(),
    contentId: varchar("content_id", { length: 80 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [uniqueIndex("help_favorites_user_content_unique").on(table.userId, table.contentType, table.contentId), index("help_favorites_user_created_idx").on(table.userId, table.createdAt)],
);

export const faqSuggestions = mysqlTable(
  "faq_suggestions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    question: varchar("question", { length: 280 }).notNull(),
    detail: text("detail"),
    status: faqSuggestionStatusEnum.notNull().default("pendente"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("faq_suggestions_user_created_idx").on(table.userId, table.createdAt), index("faq_suggestions_status_created_idx").on(table.status, table.createdAt)],
);

export const alrtIncomingEvents = mysqlTable(
  "alrt_incoming_events",
  {
    id: int("id").autoincrement().primaryKey(),
    eventId: varchar("event_id", { length: 120 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    correlationId: varchar("correlation_id", { length: 160 }).notNull(),
    sourceEnvironment: varchar("source_environment", { length: 32 }).notNull(),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    schemaVersion: varchar("schema_version", { length: 16 }).notNull(),
    category: varchar("category", { length: 160 }).notNull(),
    priority: incidentPriorityEnum.notNull(),
    description: text("description").notNull(),
    address: varchar("address", { length: 500 }).notNull(),
    latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
    reportedAt: timestamp("reported_at").notNull(),
    payloadDigest: varchar("payload_digest", { length: 64 }).notNull(),
    status: alrtIncomingEventStatusEnum.notNull().default("recebido"),
    createdIncidentId: int("created_incident_id").references(() => incidents.id, { onDelete: "set null" }),
    errorCode: varchar("error_code", { length: 80 }),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
  },
  table => [uniqueIndex("alrt_incoming_events_event_unique").on(table.eventId), uniqueIndex("alrt_incoming_events_idempotency_unique").on(table.idempotencyKey), index("alrt_incoming_events_status_received_idx").on(table.status, table.receivedAt), index("alrt_incoming_events_correlation_idx").on(table.correlationId)],
);

export const externalIncidentReviews = mysqlTable(
  "external_incident_reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    incomingEventId: int("incoming_event_id").notNull(),
    workflowId: int("workflow_id").notNull(),
    workflowVersionId: int("workflow_version_id").notNull(),
    correlationId: varchar("correlation_id", { length: 160 }).notNull(),
    status: externalIncidentReviewStatusEnum.notNull().default("pendente"),
    category: varchar("category", { length: 160 }).notNull(),
    priority: incidentPriorityEnum.notNull(),
    origin: incidentOriginEnum.notNull().default("integracao"),
    requesterName: varchar("requester_name", { length: 200 }),
    requesterContact: varchar("requester_contact", { length: 80 }),
    description: text("description").notNull(),
    address: varchar("address", { length: 500 }).notNull(),
    latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
    reviewedByUserId: int("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    reviewNote: text("review_note"),
    createdIncidentId: int("created_incident_id").references(() => incidents.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.incomingEventId], foreignColumns: [alrtIncomingEvents.id], name: "eirev_event_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.workflowId], foreignColumns: [workflows.id], name: "eirev_workflow_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.workflowVersionId], foreignColumns: [workflowVersions.id], name: "eirev_version_fk" }).onDelete("restrict"),
    uniqueIndex("external_incident_reviews_event_unique").on(table.incomingEventId),
    index("external_incident_reviews_status_created_idx").on(table.status, table.createdAt),
    index("external_incident_reviews_workflow_idx").on(table.workflowId, table.status),
  ],
);

export const generalSettings = mysqlTable("general_settings", {
  id: int("id").primaryKey(),
  mapCenterLatitude: decimal("map_center_latitude", { precision: 10, scale: 7 }).notNull().default("-27.0976000"),
  mapCenterLongitude: decimal("map_center_longitude", { precision: 10, scale: 7 }).notNull().default("-48.9104000"),
  mapDefaultZoom: int("map_default_zoom").notNull().default(13),
  mapType: varchar("map_type", { length: 20 }).notNull().default("roadmap"),
  mapTrafficEnabled: boolean("map_traffic_enabled").notNull().default(false),
  mapAutoFitEnabled: boolean("map_auto_fit_enabled").notNull().default(true),
  mapFallbackMode: varchar("map_fallback_mode", { length: 24 }).notNull().default("automatic"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const generalSettingEntries = mysqlTable(
  "general_setting_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    section: varchar("section", { length: 80 }).notNull(),
    settingKey: varchar("setting_key", { length: 120 }).notNull(),
    value: json("value").$type<Record<string, unknown> | string | number | boolean | null>(),
    description: varchar("description", { length: 500 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("general_setting_entries_section_key_unique").on(table.section, table.settingKey), index("general_setting_entries_section_idx").on(table.section, table.active)],
);

export const workflows = mysqlTable(
  "workflows",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    description: text("description"),
    status: workflowStatusEnum.notNull().default("rascunho"),
    active: boolean("active").notNull().default(false),
    currentVersion: int("current_version").notNull().default(1),
    simulationOnly: boolean("simulation_only").notNull().default(true),
    createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
    updatedByUserId: int("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("workflows_status_active_idx").on(table.status, table.active), index("workflows_creator_idx").on(table.createdByUserId), index("workflows_updated_idx").on(table.updatedAt)],
);

export const workflowVersions = mysqlTable(
  "workflow_versions",
  {
    id: int("id").autoincrement().primaryKey(),
    workflowId: int("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
    version: int("version").notNull(),
    definition: json("definition").$type<Record<string, unknown>>().notNull(),
    validationReport: json("validation_report").$type<Record<string, unknown> | null>(),
    changeSummary: varchar("change_summary", { length: 500 }),
    createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [uniqueIndex("workflow_versions_workflow_version_unique").on(table.workflowId, table.version), index("workflow_versions_workflow_created_idx").on(table.workflowId, table.createdAt)],
);

export const workflowExecutions = mysqlTable(
  "workflow_executions",
  {
    id: int("id").autoincrement().primaryKey(),
    workflowId: int("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
    workflowVersionId: int("workflow_version_id").references(() => workflowVersions.id, { onDelete: "set null" }),
    triggerType: varchar("trigger_type", { length: 80 }).notNull().default("manual"),
    mode: workflowExecutionModeEnum.notNull().default("simulacao"),
    status: workflowExecutionStatusEnum.notNull().default("pendente"),
    idempotencyKey: varchar("idempotency_key", { length: 160 }),
    inputData: json("input_data").$type<Record<string, unknown> | null>(),
    outputData: json("output_data").$type<Record<string, unknown> | null>(),
    errorData: json("error_data").$type<Record<string, unknown> | null>(),
    attempts: int("attempts").notNull().default(0),
    maxAttempts: int("max_attempts").notNull().default(3),
    retryOfExecutionId: int("retry_of_execution_id"),
    queuedAt: timestamp("queued_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    nextAttemptAt: timestamp("next_attempt_at"),
    initiatedByUserId: int("initiated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("workflow_executions_idempotency_unique").on(table.idempotencyKey), uniqueIndex("workflow_executions_retry_source_unique").on(table.retryOfExecutionId), foreignKey({ columns: [table.retryOfExecutionId], foreignColumns: [table.id], name: "workflow_execution_retry_fk" }).onDelete("set null"), index("workflow_executions_queue_idx").on(table.status, table.nextAttemptAt), index("workflow_executions_workflow_created_idx").on(table.workflowId, table.createdAt), index("workflow_executions_mode_status_idx").on(table.mode, table.status)],
);

export const workflowExecutionSteps = mysqlTable(
  "workflow_execution_steps",
  {
    id: int("id").autoincrement().primaryKey(),
    executionId: int("execution_id").notNull().references(() => workflowExecutions.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id", { length: 120 }).notNull(),
    nodeType: varchar("node_type", { length: 100 }).notNull(),
    status: workflowExecutionStatusEnum.notNull().default("pendente"),
    inputData: json("input_data").$type<Record<string, unknown> | null>(),
    outputData: json("output_data").$type<Record<string, unknown> | null>(),
    errorData: json("error_data").$type<Record<string, unknown> | null>(),
    durationMs: int("duration_ms"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [uniqueIndex("workflow_execution_steps_execution_node_unique").on(table.executionId, table.nodeId), index("workflow_execution_steps_execution_idx").on(table.executionId, table.createdAt)],
);

export const integrationConnections = mysqlTable(
  "integration_connections",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 100 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    description: text("description"),
    connectionType: varchar("connection_type", { length: 80 }).notNull(),
    environment: varchar("environment", { length: 32 }).notNull().default("simulacao"),
    baseUrl: varchar("base_url", { length: 2048 }),
    active: boolean("active").notNull().default(false),
    simulationOnly: boolean("simulation_only").notNull().default(true),
    configuration: json("configuration").$type<Record<string, unknown> | null>(),
    createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
    updatedByUserId: int("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("integration_connections_code_unique").on(table.code), index("integration_connections_active_idx").on(table.active, table.environment)],
);

export const integrationCredentials = mysqlTable(
  "integration_credentials",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    credentialType: varchar("credential_type", { length: 80 }).notNull(),
    environment: varchar("environment", { length: 32 }).notNull().default("simulacao"),
    description: text("description"),
    maskedSummary: varchar("masked_summary", { length: 500 }),
    encryptedPayload: text("encrypted_payload"),
    keyVersion: varchar("key_version", { length: 64 }),
    expiresAt: timestamp("expires_at"),
    active: boolean("active").notNull().default(false),
    simulationOnly: boolean("simulation_only").notNull().default(true),
    createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
    updatedByUserId: int("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("integration_credentials_name_environment_unique").on(table.name, table.environment), index("integration_credentials_active_idx").on(table.active, table.environment)],
);

export const integrationWebhooks = mysqlTable(
  "integration_webhooks",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    method: varchar("method", { length: 12 }).notNull().default("POST"),
    path: varchar("path", { length: 255 }).notNull(),
    allowedIps: json("allowed_ips").$type<string[] | null>(),
    workflowId: int("workflow_id").references(() => workflows.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(false),
    simulationOnly: boolean("simulation_only").notNull().default(true),
    timeoutMs: int("timeout_ms").notNull().default(15000),
    createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
    updatedByUserId: int("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("integration_webhooks_path_unique").on(table.path), index("integration_webhooks_workflow_idx").on(table.workflowId, table.active)],
);

export const integrationLogs = mysqlTable(
  "integration_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    executionId: int("execution_id").references(() => workflowExecutions.id, { onDelete: "set null" }),
    workflowId: int("workflow_id").references(() => workflows.id, { onDelete: "set null" }),
    connectionId: int("connection_id").references(() => integrationConnections.id, { onDelete: "set null" }),
    webhookId: int("webhook_id").references(() => integrationWebhooks.id, { onDelete: "set null" }),
    level: integrationLogLevelEnum.notNull().default("info"),
    source: varchar("source", { length: 100 }).notNull(),
    message: text("message").notNull(),
    endpoint: varchar("endpoint", { length: 2048 }),
    requestData: json("request_data").$type<Record<string, unknown> | null>(),
    responseData: json("response_data").$type<Record<string, unknown> | null>(),
    httpStatus: int("http_status"),
    durationMs: int("duration_ms"),
    retryAttempt: int("retry_attempt").notNull().default(0),
    errorCode: varchar("error_code", { length: 120 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("integration_logs_execution_idx").on(table.executionId, table.createdAt), index("integration_logs_workflow_created_idx").on(table.workflowId, table.createdAt), index("integration_logs_level_created_idx").on(table.level, table.createdAt)],
);

export const integrationEventCatalog = mysqlTable(
  "integration_event_catalog",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 160 }).notNull(),
    source: varchar("source", { length: 100 }).notNull(),
    description: text("description").notNull(),
    payloadSchema: json("payload_schema").$type<Record<string, unknown> | null>(),
    examplePayload: json("example_payload").$type<Record<string, unknown> | null>(),
    version: varchar("version", { length: 32 }).notNull().default("v1"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("integration_event_catalog_code_version_unique").on(table.code, table.version), index("integration_event_catalog_source_idx").on(table.source, table.active)],
);

export const integrationOpenapiSpecs = mysqlTable(
  "integration_openapi_specs",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    apiVersion: varchar("api_version", { length: 80 }).notNull(),
    openapiVersion: varchar("openapi_version", { length: 32 }).notNull(),
    description: text("description"),
    sourceType: varchar("source_type", { length: 32 }).notNull().default("importado"),
    importFormat: varchar("import_format", { length: 16 }).notNull().default("json"),
    document: json("document").$type<Record<string, unknown>>().notNull(),
    operationCount: int("operation_count").notNull().default(0),
    simulationOnly: boolean("simulation_only").notNull().default(true),
    createdByUserId: int("created_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "openapi_spec_actor_fk" }), index("integration_openapi_specs_source_idx").on(table.sourceType, table.createdAt)],
);

export const integrationOpenapiOperations = mysqlTable(
  "integration_openapi_operations",
  {
    id: int("id").autoincrement().primaryKey(),
    specId: int("spec_id").notNull(),
    operationKey: varchar("operation_key", { length: 180 }).notNull(),
    method: varchar("method", { length: 12 }).notNull(),
    path: varchar("path", { length: 1024 }).notNull(),
    summary: varchar("summary", { length: 500 }),
    description: text("description"),
    tags: json("tags").$type<string[] | null>(),
    parameters: json("parameters").$type<Record<string, unknown>[] | null>(),
    requestBody: json("request_body").$type<Record<string, unknown> | null>(),
    responses: json("responses").$type<Record<string, unknown> | null>(),
    security: json("security").$type<Record<string, unknown>[] | null>(),
    generatedConnectionId: int("generated_connection_id"),
    simulationOnly: boolean("simulation_only").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [foreignKey({ columns: [table.specId], foreignColumns: [integrationOpenapiSpecs.id], name: "openapi_op_spec_fk" }).onDelete("cascade"), foreignKey({ columns: [table.generatedConnectionId], foreignColumns: [integrationConnections.id], name: "openapi_op_conn_fk" }).onDelete("set null"), uniqueIndex("integration_openapi_operations_spec_key_unique").on(table.specId, table.operationKey), index("integration_openapi_operations_spec_idx").on(table.specId, table.method), index("integration_openapi_operations_connection_idx").on(table.generatedConnectionId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Incident = typeof incidents.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
