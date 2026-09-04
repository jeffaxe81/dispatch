import { and, count, desc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  auditLogs,
  alrtIncomingEvents,
  externalIncidentReviews,
  dashboardSavedFilters,
  faqSuggestions,
  helpFavorites,
  accessPermissions,
  accessRoles,
  generalSettingEntries,
  generalSettings,
  incidentAssignments,
  incidentEvidence,
  incidentEvents,
  incidents,
  type InsertUser,
  type User,
  teamLocations,
  teams,
  organizations,
  organizationalUnits,
  rolePermissions,
  users,
  userProfiles,
  userRoleAssignments,
  vehicles,
  workflowExecutions,
  workflowExecutionSteps,
  workflowVersions,
  workflows,
  integrationConnections,
  integrationCredentials,
  integrationEventCatalog,
  integrationLogs,
  integrationOpenapiOperations,
  integrationOpenapiSpecs,
  integrationWebhooks,
} from "../drizzle/schema";
import { operationalPresence, workSessions, workSessionEvents } from "../drizzle/cp016Schema";
import type { IncidentPriority, IncidentStatus, OperationalRole } from "../shared/operations";
import { ENV } from "./_core/env";
import { canUpdateRoleDefinition, isRoleScopeAssignmentValid } from "./accessPolicies";
import { resolveOperationalPresenceState } from "./operationalPresence";
import { parseOpenapiDocument } from "./openapi";
import { storageGet, storagePut } from "./storage";

let cachedDb: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!cachedDb && process.env.DATABASE_URL) cachedDb = drizzle(process.env.DATABASE_URL);
  return cachedDb;
}

export function setDbForTesting(db: ReturnType<typeof drizzle> | null) {
  if (process.env.NODE_ENV !== "test") throw new Error("A injeção de banco é permitida somente durante testes.");
  cachedDb = db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function upsertUser(user: InsertUser) {
  if (!user.openId) throw new Error("openId é obrigatório.");
  const db = await requireDb();
  const isOwner = user.openId === ENV.ownerOpenId;
  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email?.trim().toLowerCase() ?? null,
    loginMethod: user.loginMethod ?? null,
    role: isOwner ? "admin" : (user.role ?? "user"),
    operationalRole: isOwner ? "administrador" : (user.operationalRole ?? "operador"),
    lastSignedIn: new Date(),
  };
  const updateSet: Record<string, unknown> = {
    name: values.name,
    email: values.email,
    loginMethod: values.loginMethod,
    lastSignedIn: values.lastSignedIn,
  };
  if (isOwner) {
    updateSet.role = "admin";
    updateSet.operationalRole = "administrador";
    updateSet.active = true;
  }
  const existingByOpenId = (await db.select({ id: users.id }).from(users).where(eq(users.openId, user.openId)).limit(1))[0];
  if (!existingByOpenId && values.email) {
    const preprovisioned = (await db.select({ id: users.id }).from(users).where(and(eq(users.email, values.email), eq(users.loginMethod, "preprovisioned"))).limit(1))[0];
    if (shouldLinkPreprovisionedUser({ hasExistingOpenId: false, hasCorporateEmail: Boolean(values.email), hasPreprovisionedEmail: Boolean(preprovisioned) })) {
      await db.update(users).set({ openId: values.openId, name: values.name, email: values.email, loginMethod: values.loginMethod, lastSignedIn: values.lastSignedIn, ...(isOwner ? { role: "admin" as const, operationalRole: "administrador" as const, active: true } : {}) }).where(eq(users.id, preprovisioned.id));
      await db.insert(auditLogs).values({ resourceType: "user", resourceId: preprovisioned.id, action: "manual_preprovision_linked", actorUserId: null, beforeData: { loginMethod: "preprovisioned" }, afterData: { loginMethod: values.loginMethod, email: values.email } });
      return;
    }
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await requireDb();
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export type IncidentListInput = {
  page: number;
  pageSize: number;
  search?: string;
  status?: IncidentStatus;
  priority?: IncidentPriority;
  teamId?: number;
};

export async function listIncidents(input: IncidentListInput) {
  const db = await requireDb();
  const clauses = [];
  if (input.search) clauses.push(or(like(incidents.protocol, `%${input.search}%`), like(incidents.description, `%${input.search}%`), like(incidents.address, `%${input.search}%`))!);
  if (input.status) clauses.push(eq(incidents.status, input.status));
  if (input.priority) clauses.push(eq(incidents.priority, input.priority));
  if (input.teamId) clauses.push(eq(incidents.assignedTeamId, input.teamId));
  const where = clauses.length ? and(...clauses) : undefined;
  const offset = (input.page - 1) * input.pageSize;
  const [items, totals] = await Promise.all([
    db.select().from(incidents).where(where).orderBy(desc(incidents.createdAt)).limit(input.pageSize).offset(offset),
    db.select({ total: count() }).from(incidents).where(where),
  ]);
  return { items, total: Number(totals[0]?.total ?? 0), page: input.page, pageSize: input.pageSize };
}

export async function getIncidentById(id: number) {
  const db = await requireDb();
  return (await db.select().from(incidents).where(eq(incidents.id, id)).limit(1))[0];
}

export async function getIncidentEvents(incidentId: number) {
  const db = await requireDb();
  return db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, incidentId)).orderBy(incidentEvents.createdAt);
}

export async function getIncidentAssignments(incidentId: number) {
  const db = await requireDb();
  return db.select().from(incidentAssignments).where(eq(incidentAssignments.incidentId, incidentId)).orderBy(desc(incidentAssignments.assignedAt));
}

export async function getIncidentEvidence(incidentId: number) {
  const db = await requireDb();
  return db.select().from(incidentEvidence).where(eq(incidentEvidence.incidentId, incidentId)).orderBy(desc(incidentEvidence.createdAt));
}

export async function createIncident(input: typeof incidents.$inferInsert, actorUserId: number | null) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [created] = await tx.insert(incidents).values(input).$returningId();
    await tx.insert(incidentEvents).values({ incidentId: created.id, actorUserId, eventType: "created", message: "Ocorrência criada.", metadata: null });
    await tx.insert(auditLogs).values({ resourceType: "incident", resourceId: created.id, action: "create", actorUserId, beforeData: null, afterData: input as any });
    return created.id;
  });
}

export async function updateIncident(id: number, patch: Partial<typeof incidents.$inferInsert>, actorUserId: number | null) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(incidents).where(eq(incidents.id, id)).limit(1))[0];
    if (!before) throw new Error("Ocorrência não encontrada.");
    await tx.update(incidents).set(patch).where(eq(incidents.id, id));
    await tx.insert(auditLogs).values({ resourceType: "incident", resourceId: id, action: "update", actorUserId, beforeData: before as any, afterData: patch as any });
  });
}

export async function addIncidentEvent(input: typeof incidentEvents.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(incidentEvents).values(input).$returningId();
  return created.id;
}

export async function assignIncident(input: { incidentId: number; teamId: number; actorUserId: number; notes?: string | null }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const incident = (await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1))[0];
    if (!incident) throw new Error("Ocorrência não encontrada.");
    const now = new Date();
    const [assignment] = await tx.insert(incidentAssignments).values({ incidentId: input.incidentId, teamId: input.teamId, assignedByUserId: input.actorUserId, assignedAt: now, status: "atribuida", notes: input.notes ?? null }).$returningId();
    await tx.update(incidents).set({ assignedTeamId: input.teamId, status: "despachada", dispatchedAt: now }).where(eq(incidents.id, input.incidentId));
    await tx.insert(incidentEvents).values({ incidentId: input.incidentId, actorUserId: input.actorUserId, teamId: input.teamId, eventType: "assigned", message: "Equipe despachada para a ocorrência.", metadata: { assignmentId: assignment.id } });
    await tx.insert(auditLogs).values({ resourceType: "incident", resourceId: input.incidentId, action: "assign", actorUserId: input.actorUserId, beforeData: { assignedTeamId: incident.assignedTeamId, status: incident.status }, afterData: { assignedTeamId: input.teamId, status: "despachada", assignmentId: assignment.id } });
    return assignment.id;
  });
}

export async function acceptAssignment(input: { assignmentId: number; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const assignment = (await tx.select().from(incidentAssignments).where(eq(incidentAssignments.id, input.assignmentId)).limit(1))[0];
    if (!assignment) throw new Error("Despacho não encontrado.");
    const now = new Date();
    await tx.update(incidentAssignments).set({ status: "aceita", acceptedAt: now }).where(eq(incidentAssignments.id, input.assignmentId));
    await tx.update(incidents).set({ status: "aceita", acceptedAt: now }).where(eq(incidents.id, assignment.incidentId));
    await tx.update(teams).set({ status: "em_deslocamento" }).where(eq(teams.id, assignment.teamId));
    await tx.insert(incidentEvents).values({ incidentId: assignment.incidentId, actorUserId: input.actorUserId, teamId: assignment.teamId, eventType: "accepted", message: "Equipe aceitou o despacho.", metadata: { assignmentId: input.assignmentId } });
    await tx.insert(auditLogs).values({ resourceType: "incident_assignment", resourceId: input.assignmentId, action: "accept", actorUserId: input.actorUserId, beforeData: { status: assignment.status }, afterData: { status: "aceita", acceptedAt: now.toISOString() } });
  });
}

export async function markIncidentInService(input: { incidentId: number; actorUserId: number; teamId: number }) {
  const db = await requireDb();
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(incidents).set({ status: "em_atendimento", inServiceAt: now }).where(eq(incidents.id, input.incidentId));
    await tx.update(teams).set({ status: "em_atendimento" }).where(eq(teams.id, input.teamId));
    await tx.insert(incidentEvents).values({ incidentId: input.incidentId, actorUserId: input.actorUserId, teamId: input.teamId, eventType: "in_service", message: "Atendimento iniciado no local.", metadata: null });
    await tx.insert(auditLogs).values({ resourceType: "incident", resourceId: input.incidentId, action: "in_service", actorUserId: input.actorUserId, beforeData: null, afterData: { status: "em_atendimento", at: now.toISOString() } });
  });
}

export async function completeIncident(input: { incidentId: number; actorUserId: number; teamId: number; resolution?: string | null }) {
  const db = await requireDb();
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(incidents).set({ status: "concluida", completedAt: now, resolution: input.resolution ?? null }).where(eq(incidents.id, input.incidentId));
    await tx.update(teams).set({ status: "disponivel" }).where(eq(teams.id, input.teamId));
    await tx.insert(incidentEvents).values({ incidentId: input.incidentId, actorUserId: input.actorUserId, teamId: input.teamId, eventType: "completed", message: "Ocorrência concluída.", metadata: input.resolution ? { resolution: input.resolution } : null });
    await tx.insert(auditLogs).values({ resourceType: "incident", resourceId: input.incidentId, action: "complete", actorUserId: input.actorUserId, beforeData: null, afterData: { status: "concluida", completedAt: now.toISOString() } });
  });
}

export async function cancelIncident(input: { incidentId: number; actorUserId: number; reason?: string | null }) {
  const db = await requireDb();
  const now = new Date();
  await db.transaction(async tx => {
    const before = (await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1))[0];
    if (!before) throw new Error("Ocorrência não encontrada.");
    await tx.update(incidents).set({ status: "cancelada", completedAt: now, resolution: input.reason ?? null }).where(eq(incidents.id, input.incidentId));
    await tx.insert(incidentEvents).values({ incidentId: input.incidentId, actorUserId: input.actorUserId, teamId: before.assignedTeamId, eventType: "cancelled", message: input.reason ? `Ocorrência cancelada: ${input.reason}` : "Ocorrência cancelada.", metadata: input.reason ? { reason: input.reason } : null });
    await tx.insert(auditLogs).values({ resourceType: "incident", resourceId: input.incidentId, action: "cancel", actorUserId: input.actorUserId, beforeData: { status: before.status }, afterData: { status: "cancelada", completedAt: now.toISOString(), reason: input.reason ?? null } });
  });
}

export async function addTeamLocation(input: typeof teamLocations.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(teamLocations).values(input).$returningId();
  return created.id;
}

export async function getLatestTeamLocation(teamId: number) {
  const db = await requireDb();
  return (await db.select().from(teamLocations).where(eq(teamLocations.teamId, teamId)).orderBy(desc(teamLocations.recordedAt)).limit(1))[0];
}

export async function getTeamLocationHistory(teamId: number, startDate?: Date, endDate?: Date) {
  const db = await requireDb();
  const clauses = [eq(teamLocations.teamId, teamId)];
  if (startDate) clauses.push(gte(teamLocations.recordedAt, startDate));
  if (endDate) clauses.push(lte(teamLocations.recordedAt, endDate));
  return db.select().from(teamLocations).where(and(...clauses)).orderBy(teamLocations.recordedAt);
}

export async function getUserById(id: number) {
  const db = await requireDb();
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
}

export function isManualUserLinkAllowed(input: { hasExistingOpenId: boolean; hasCorporateEmail: boolean; hasPreprovisionedEmail: boolean }) {
  return !input.hasExistingOpenId && input.hasCorporateEmail && input.hasPreprovisionedEmail;
}

export const shouldLinkPreprovisionedUser = isManualUserLinkAllowed;

export async function listUsers() {
  const db = await requireDb();
  return db.select().from(users).orderBy(users.name, users.email);
}

export async function createPreprovisionedUser(input: { name: string; email: string; operationalRole: OperationalRole; actorUserId: number }) {
  const db = await requireDb();
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("E-mail é obrigatório.");
  const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (existing) throw new Error("Já existe um usuário com este e-mail.");
  const [created] = await db.insert(users).values({ openId: `pre_${nanoid(18)}`, name: input.name.trim(), email, loginMethod: "preprovisioned", operationalRole: input.operationalRole, role: "user", active: true }).$returningId();
  await db.insert(auditLogs).values({ resourceType: "user", resourceId: created.id, action: "preprovision", actorUserId: input.actorUserId, beforeData: null, afterData: { email, operationalRole: input.operationalRole } });
  return created.id;
}

export async function setUserActive(input: { userId: number; active: boolean; actorUserId: number }) {
  const db = await requireDb();
  const before = (await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
  if (!before) throw new Error("Usuário não encontrado.");
  await db.update(users).set({ active: input.active }).where(eq(users.id, input.userId));
  await db.insert(auditLogs).values({ resourceType: "user", resourceId: input.userId, action: input.active ? "activate" : "deactivate", actorUserId: input.actorUserId, beforeData: { active: before.active }, afterData: { active: input.active } });
}

export async function setUserOperationalRole(input: { userId: number; operationalRole: OperationalRole; actorUserId: number }) {
  const db = await requireDb();
  const before = (await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
  if (!before) throw new Error("Usuário não encontrado.");
  if (!canUpdateRoleDefinition({ actorUserId: input.actorUserId, targetUserId: input.userId, previousRole: before.operationalRole, nextRole: input.operationalRole })) throw new Error("Alteração de perfil não permitida.");
  await db.update(users).set({ operationalRole: input.operationalRole }).where(eq(users.id, input.userId));
  await db.insert(auditLogs).values({ resourceType: "user", resourceId: input.userId, action: "operational_role_updated", actorUserId: input.actorUserId, beforeData: { operationalRole: before.operationalRole }, afterData: { operationalRole: input.operationalRole } });
}

export async function getAccessRoles() {
  const db = await requireDb();
  return db.select().from(accessRoles).orderBy(accessRoles.name);
}

export async function getAccessPermissions() {
  const db = await requireDb();
  return db.select().from(accessPermissions).orderBy(accessPermissions.resource, accessPermissions.action);
}

export async function getUserRoleAssignments(userId?: number) {
  const db = await requireDb();
  return db.select().from(userRoleAssignments).where(userId ? eq(userRoleAssignments.userId, userId) : undefined).orderBy(desc(userRoleAssignments.createdAt));
}

export async function assignUserRole(input: { userId: number; roleId: number; organizationId?: number | null; organizationalUnitId?: number | null; teamId?: number | null; actorUserId: number }) {
  const db = await requireDb();
  if (!isRoleScopeAssignmentValid(input)) throw new Error("Escopo de perfil inválido.");
  const [created] = await db.insert(userRoleAssignments).values({ userId: input.userId, roleId: input.roleId, organizationId: input.organizationId ?? null, organizationalUnitId: input.organizationalUnitId ?? null, teamId: input.teamId ?? null, assignedByUserId: input.actorUserId }).$returningId();
  return created.id;
}

export async function revokeUserRole(assignmentId: number) {
  const db = await requireDb();
  await db.delete(userRoleAssignments).where(eq(userRoleAssignments.id, assignmentId));
}

export async function getGeneralSettings() {
  const db = await requireDb();
  const settings = await db.select().from(generalSettings).limit(1);
  return settings[0] ?? null;
}

export async function getGeneralSettingEntries(settingId: number) {
  const db = await requireDb();
  return db.select().from(generalSettingEntries).where(eq(generalSettingEntries.settingId, settingId)).orderBy(generalSettingEntries.position);
}

export async function listDashboardSavedFilters(userId: number) {
  const db = await requireDb();
  return db.select().from(dashboardSavedFilters).where(eq(dashboardSavedFilters.userId, userId)).orderBy(desc(dashboardSavedFilters.isDefault), dashboardSavedFilters.name);
}

export async function saveDashboardFilter(input: { userId: number; name: string; startDate?: Date | null; endDate?: Date | null; teamId?: number | null; isDefault?: boolean }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    if (input.isDefault) await tx.update(dashboardSavedFilters).set({ isDefault: false }).where(eq(dashboardSavedFilters.userId, input.userId));
    const [created] = await tx.insert(dashboardSavedFilters).values({ userId: input.userId, name: input.name.trim(), startDate: input.startDate ?? null, endDate: input.endDate ?? null, teamId: input.teamId ?? null, isDefault: input.isDefault ?? false }).$returningId();
    return created.id;
  });
}

export async function deleteDashboardSavedFilter(input: { id: number; userId: number }) {
  const db = await requireDb();
  await db.delete(dashboardSavedFilters).where(and(eq(dashboardSavedFilters.id, input.id), eq(dashboardSavedFilters.userId, input.userId)));
}

export async function getHelpFavorites(userId: number) {
  const db = await requireDb();
  return db.select().from(helpFavorites).where(eq(helpFavorites.userId, userId)).orderBy(desc(helpFavorites.createdAt));
}

export async function addHelpFavorite(input: typeof helpFavorites.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(helpFavorites).values(input).$returningId();
  return created.id;
}

export async function removeHelpFavorite(input: { userId: number; contentType: typeof helpFavorites.$inferSelect.contentType; contentId: string }) {
  const db = await requireDb();
  await db.delete(helpFavorites).where(and(eq(helpFavorites.userId, input.userId), eq(helpFavorites.contentType, input.contentType), eq(helpFavorites.contentId, input.contentId)));
}

export async function createFaqSuggestion(input: typeof faqSuggestions.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(faqSuggestions).values(input).$returningId();
  return created.id;
}

export async function getFaqSuggestions(userId?: number) {
  const db = await requireDb();
  return db.select().from(faqSuggestions).where(userId ? eq(faqSuggestions.userId, userId) : undefined).orderBy(desc(faqSuggestions.createdAt));
}

export async function getAlrtIncomingEventByEventId(eventId: string) {
  const db = await requireDb();
  return (await db.select().from(alrtIncomingEvents).where(eq(alrtIncomingEvents.eventId, eventId)).limit(1))[0];
}

export async function getAlrtIncomingEventByIdempotencyKey(idempotencyKey: string) {
  const db = await requireDb();
  return (await db.select().from(alrtIncomingEvents).where(eq(alrtIncomingEvents.idempotencyKey, idempotencyKey)).limit(1))[0];
}

export async function createAlrtIncomingEvent(input: typeof alrtIncomingEvents.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(alrtIncomingEvents).values(input).$returningId();
  return created.id;
}

export async function updateAlrtIncomingEvent(id: number, patch: Partial<typeof alrtIncomingEvents.$inferInsert>) {
  const db = await requireDb();
  await db.update(alrtIncomingEvents).set(patch).where(eq(alrtIncomingEvents.id, id));
}

export async function getExternalIncidentReviewByIncomingEventId(incomingEventId: number) {
  const db = await requireDb();
  return (await db.select().from(externalIncidentReviews).where(eq(externalIncidentReviews.incomingEventId, incomingEventId)).limit(1))[0];
}

export async function createExternalIncidentReview(input: typeof externalIncidentReviews.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(externalIncidentReviews).values(input).$returningId();
  return created.id;
}

export async function updateExternalIncidentReview(id: number, patch: Partial<typeof externalIncidentReviews.$inferInsert>) {
  const db = await requireDb();
  await db.update(externalIncidentReviews).set(patch).where(eq(externalIncidentReviews.id, id));
}

export async function getWorkflowById(id: number) {
  const db = await requireDb();
  return (await db.select().from(workflows).where(eq(workflows.id, id)).limit(1))[0];
}

export async function createWorkflow(input: typeof workflows.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(workflows).values(input).$returningId();
  return created.id;
}

export async function updateWorkflow(id: number, patch: Partial<typeof workflows.$inferInsert>) {
  const db = await requireDb();
  await db.update(workflows).set(patch).where(eq(workflows.id, id));
}

export async function createWorkflowVersion(input: typeof workflowVersions.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(workflowVersions).values(input).$returningId();
  return created.id;
}

export async function getWorkflowVersions(workflowId: number) {
  const db = await requireDb();
  return db.select().from(workflowVersions).where(eq(workflowVersions.workflowId, workflowId)).orderBy(desc(workflowVersions.version));
}

export async function getWorkflowExecutions(workflowId?: number) {
  const db = await requireDb();
  return db.select().from(workflowExecutions).where(workflowId ? eq(workflowExecutions.workflowId, workflowId) : undefined).orderBy(desc(workflowExecutions.createdAt));
}

export async function getWorkflowExecutionById(id: number) {
  const db = await requireDb();
  return (await db.select().from(workflowExecutions).where(eq(workflowExecutions.id, id)).limit(1))[0];
}

export async function createWorkflowExecution(input: typeof workflowExecutions.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(workflowExecutions).values(input).$returningId();
  return created.id;
}

export async function updateWorkflowExecution(id: number, patch: Partial<typeof workflowExecutions.$inferInsert>) {
  const db = await requireDb();
  await db.update(workflowExecutions).set(patch).where(eq(workflowExecutions.id, id));
}

export async function createWorkflowExecutionStep(input: typeof workflowExecutionSteps.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(workflowExecutionSteps).values(input).$returningId();
  return created.id;
}

export async function updateWorkflowExecutionStep(id: number, patch: Partial<typeof workflowExecutionSteps.$inferInsert>) {
  const db = await requireDb();
  await db.update(workflowExecutionSteps).set(patch).where(eq(workflowExecutionSteps.id, id));
}

export async function getWorkflowExecutionSteps(executionId: number) {
  const db = await requireDb();
  return db.select().from(workflowExecutionSteps).where(eq(workflowExecutionSteps.executionId, executionId)).orderBy(workflowExecutionSteps.sequence);
}

export async function getIntegrationConnections() {
  const db = await requireDb();
  return db.select().from(integrationConnections).orderBy(integrationConnections.name);
}

export async function getIntegrationConnectionById(id: number) {
  const db = await requireDb();
  return (await db.select().from(integrationConnections).where(eq(integrationConnections.id, id)).limit(1))[0];
}

export async function createIntegrationConnection(input: typeof integrationConnections.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(integrationConnections).values(input).$returningId();
  return created.id;
}

export async function updateIntegrationConnection(id: number, patch: Partial<typeof integrationConnections.$inferInsert>) {
  const db = await requireDb();
  await db.update(integrationConnections).set(patch).where(eq(integrationConnections.id, id));
}

export async function getIntegrationCredentials(connectionId?: number) {
  const db = await requireDb();
  return db.select().from(integrationCredentials).where(connectionId ? eq(integrationCredentials.connectionId, connectionId) : undefined).orderBy(desc(integrationCredentials.createdAt));
}

export async function createIntegrationCredential(input: typeof integrationCredentials.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(integrationCredentials).values(input).$returningId();
  return created.id;
}

export async function updateIntegrationCredential(id: number, patch: Partial<typeof integrationCredentials.$inferInsert>) {
  const db = await requireDb();
  await db.update(integrationCredentials).set(patch).where(eq(integrationCredentials.id, id));
}

export async function getIntegrationEventCatalog() {
  const db = await requireDb();
  return db.select().from(integrationEventCatalog).orderBy(integrationEventCatalog.name);
}

export async function createIntegrationEventCatalog(input: typeof integrationEventCatalog.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(integrationEventCatalog).values(input).$returningId();
  return created.id;
}

export async function getIntegrationLogs(connectionId?: number) {
  const db = await requireDb();
  return db.select().from(integrationLogs).where(connectionId ? eq(integrationLogs.connectionId, connectionId) : undefined).orderBy(desc(integrationLogs.createdAt));
}

export async function createIntegrationLog(input: typeof integrationLogs.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(integrationLogs).values(input).$returningId();
  return created.id;
}

export async function getIntegrationOpenapiSpecs(connectionId?: number) {
  const db = await requireDb();
  return db.select().from(integrationOpenapiSpecs).where(connectionId ? eq(integrationOpenapiSpecs.connectionId, connectionId) : undefined).orderBy(desc(integrationOpenapiSpecs.createdAt));
}

export async function createIntegrationOpenapiSpec(input: typeof integrationOpenapiSpecs.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(integrationOpenapiSpecs).values(input).$returningId();
  return created.id;
}

export async function getIntegrationOpenapiOperations(specId?: number) {
  const db = await requireDb();
  return db.select().from(integrationOpenapiOperations).where(specId ? eq(integrationOpenapiOperations.specId, specId) : undefined).orderBy(integrationOpenapiOperations.path, integrationOpenapiOperations.method);
}

export async function createIntegrationOpenapiOperation(input: typeof integrationOpenapiOperations.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(integrationOpenapiOperations).values(input).$returningId();
  return created.id;
}

export async function getIntegrationWebhooks(connectionId?: number) {
  const db = await requireDb();
  return db.select().from(integrationWebhooks).where(connectionId ? eq(integrationWebhooks.connectionId, connectionId) : undefined).orderBy(desc(integrationWebhooks.createdAt));
}

export async function createIntegrationWebhook(input: typeof integrationWebhooks.$inferInsert) {
  const db = await requireDb();
  const [created] = await db.insert(integrationWebhooks).values(input).$returningId();
  return created.id;
}

export async function updateIntegrationWebhook(id: number, patch: Partial<typeof integrationWebhooks.$inferInsert>) {
  const db = await requireDb();
  await db.update(integrationWebhooks).set(patch).where(eq(integrationWebhooks.id, id));
}

export async function getIntegrationOpenapiSpecById(id: number) {
  const db = await requireDb();
  return (await db.select().from(integrationOpenapiSpecs).where(eq(integrationOpenapiSpecs.id, id)).limit(1))[0];
}

export async function importOpenapiSpec(input: { connectionId: number; name: string; rawDocument: string; actorUserId: number }) {
  const parsed = parseOpenapiDocument(input.rawDocument);
  const db = await requireDb();
  return db.transaction(async tx => {
    const [spec] = await tx.insert(integrationOpenapiSpecs).values({ connectionId: input.connectionId, name: input.name, title: parsed.title, version: parsed.version, rawDocument: input.rawDocument, createdByUserId: input.actorUserId }).$returningId();
    for (const operation of parsed.operations) {
      await tx.insert(integrationOpenapiOperations).values({ specId: spec.id, operationId: operation.operationId, method: operation.method, path: operation.path, summary: operation.summary, requestSchema: operation.requestSchema as any, responseSchema: operation.responseSchema as any });
    }
    return spec.id;
  });
}

export type StoredObjectAuthorization =
  | { kind: "incident_evidence"; incident: typeof incidents.$inferSelect }
  | { kind: "profile_photo"; ownerUserId: number };

/**
 * Resolve a private storage key back to the resource that owns it. Signed URLs
 * must only be issued after the caller has been authorized for this resource.
 */
export async function getStoredObjectAuthorization(storageKey: string): Promise<StoredObjectAuthorization | null> {
  const db = await requireDb();
  const evidence = (await db
    .select({ incident: incidents })
    .from(incidentEvidence)
    .innerJoin(incidents, eq(incidentEvidence.incidentId, incidents.id))
    .where(eq(incidentEvidence.storageKey, storageKey))
    .limit(1))[0];
  if (evidence) return { kind: "incident_evidence", incident: evidence.incident };

  const profile = (await db
    .select({ ownerUserId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.avatarStorageKey, storageKey))
    .limit(1))[0];
  if (profile) return { kind: "profile_photo", ownerUserId: profile.ownerUserId };
  return null;
}

export async function addIncidentEvidence(input: { incidentId: number; actorUserId: number; teamId: number; fileName: string; contentType: string; description?: string | null; dataBase64: string }) {
  const { bytes, extension } = decodeEvidenceBase64(input);
  const fileName = evidenceFilename(input.fileName, extension);
  const stored = await storagePut(`incident-evidence/${input.incidentId}/${input.actorUserId}/${Date.now()}-${fileName}`, bytes, input.contentType);
  const db = await requireDb();
  return db.transaction(async tx => {
    const [created] = await tx.insert(incidentEvidence).values({ incidentId: input.incidentId, storageKey: stored.key, fileName, contentType: input.contentType, byteSize: bytes.length, description: input.description?.trim() || null, uploadedByUserId: input.actorUserId }).$returningId();
    const metadata = { evidenceId: created.id, fileName, contentType: input.contentType, byteSize: bytes.length, description: input.description?.trim() || null };
    await tx.insert(incidentEvents).values({ incidentId: input.incidentId, actorUserId: input.actorUserId, teamId: input.teamId, eventType: "evidence_added", message: `Evidência adicionada: ${fileName}`, metadata });
    await tx.insert(auditLogs).values({ resourceType: "incident_evidence", resourceId: created.id, action: "create", actorUserId: input.actorUserId, beforeData: null, afterData: { incidentId: input.incidentId, ...metadata, storagePersisted: true } });
    return { id: created.id, fileName, contentType: input.contentType, byteSize: bytes.length, description: input.description?.trim() || null, createdAt: new Date(), url: stored.url };
  });
}

export async function listTeams(teamId?: number) {
  const db = await requireDb();
  const where = teamId ? and(eq(teams.active, true), eq(teams.id, teamId)) : eq(teams.active, true);
  return db.select({ team: teams, vehiclePrefix: vehicles.prefix, vehicleType: vehicles.type, vehicleStatus: vehicles.status }).from(teams).leftJoin(vehicles, eq(vehicles.teamId, teams.id)).where(where).orderBy(teams.code);
}

type OperationalPresenceSyncInput = {
  teamId: number;
  userId: number | null;
  workSessionId: number | null;
  teamStatus: typeof teams.$inferSelect.status;
  inShift: boolean;
  shiftPaused: boolean;
  changedAt: Date;
};

async function syncOperationalPresenceTx(tx: any, input: OperationalPresenceSyncInput) {
  const state = resolveOperationalPresenceState({
    inShift: input.inShift,
    shiftPaused: input.shiftPaused,
    teamStatus: input.teamStatus,
  });
  const existing = (await tx
    .select({ id: operationalPresence.id })
    .from(operationalPresence)
    .where(eq(operationalPresence.teamId, input.teamId))
    .orderBy(desc(operationalPresence.lastChangedAt))
    .limit(1))[0];
  const values = {
    userId: input.userId,
    teamId: input.teamId,
    workSessionId: input.workSessionId,
    status: state.status,
    availableForDispatch: state.availableForDispatch,
    lastChangedAt: input.changedAt,
  };
  if (existing) {
    await tx.update(operationalPresence).set(values).where(eq(operationalPresence.id, existing.id));
  } else {
    await tx.insert(operationalPresence).values(values);
  }
  return state;
}

export async function upsertOperationalPresence(input: OperationalPresenceSyncInput) {
  const db = await requireDb();
  return db.transaction(async tx => syncOperationalPresenceTx(tx, input));
}

export async function getEligibleTeamCandidates() {
  const db = await requireDb();
  return db
    .select({ team: teams, presence: operationalPresence })
    .from(operationalPresence)
    .innerJoin(teams, eq(operationalPresence.teamId, teams.id))
    .where(and(
      eq(teams.active, true),
      eq(operationalPresence.status, "available"),
      eq(operationalPresence.availableForDispatch, true),
    ))
    .orderBy(teams.code);
}

export async function updateTeamStatus(input: { teamId: number; status: typeof teams.$inferSelect.status; actorUserId: number }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const before = (await tx.select().from(teams).where(eq(teams.id, input.teamId)).limit(1))[0];
    if (!before) throw new Error("Equipe não encontrada.");
    await tx.update(teams).set({ status: input.status }).where(eq(teams.id, input.teamId));
    const session = (await tx.select().from(workSessions).where(and(eq(workSessions.teamId, input.teamId), inArray(workSessions.status, ["open", "paused"]))).orderBy(desc(workSessions.startedAt)).limit(1))[0];
    await syncOperationalPresenceTx(tx, {
      teamId: input.teamId,
      userId: session?.userId ?? null,
      workSessionId: session?.id ?? null,
      teamStatus: input.status,
      inShift: Boolean(before.shiftStartedAt && !before.shiftEndsAt),
      shiftPaused: Boolean(before.shiftPausedAt),
      changedAt: new Date(),
    });
    await tx.insert(auditLogs).values({ resourceType: "team", resourceId: input.teamId, action: "status_updated", actorUserId: input.actorUserId, beforeData: { status: before.status }, afterData: { status: input.status } });
  });
}

export type TeamShiftAction = "start" | "pause" | "resume" | "end";

export function resolveTeamShiftAction(input: { startedAt: Date | null; pausedAt: Date | null; endedAt: Date | null; pausedTotalSeconds: number }, action: TeamShiftAction, now = new Date()) {
  const active = Boolean(input.startedAt && !input.endedAt);
  const paused = Boolean(active && input.pausedAt);
  const additionalPausedSeconds = (action === "resume" || action === "end") && input.pausedAt ? Math.floor((now.getTime() - input.pausedAt.getTime()) / 1000) : 0;
  const pausedTotalSeconds = Math.max(0, input.pausedTotalSeconds + additionalPausedSeconds);

  if (action === "start") {
    if (active) throw new Error("A jornada já está em andamento.");
    return { shiftStartedAt: now, shiftEndsAt: null, shiftPausedAt: null, shiftPausedTotalSeconds: 0 };
  }
  if (!active) throw new Error("Inicie a jornada antes de registrar esta ação.");
  if (action === "pause") {
    if (paused) throw new Error("A jornada já está em pausa.");
    return { shiftPausedAt: now };
  }
  if (action === "resume") {
    if (!paused) throw new Error("A jornada não está em pausa.");
    return { shiftPausedAt: null, shiftPausedTotalSeconds: pausedTotalSeconds };
  }
  return { shiftEndsAt: now, shiftPausedAt: null, shiftPausedTotalSeconds: pausedTotalSeconds };
}

export function resolveTeamShiftPersistence(input: { startedAt: Date | null; pausedAt: Date | null; endedAt: Date | null; pausedTotalSeconds: number }, action: TeamShiftAction, now = new Date()) {
  const teamPatch = resolveTeamShiftAction(input, action, now);
  const totalPauseSeconds = teamPatch.shiftPausedTotalSeconds ?? input.pausedTotalSeconds;
  const sessionStatus: "open" | "paused" | "closed" = action === "pause" ? "paused" : action === "end" ? "closed" : "open";
  return {
    teamPatch,
    eventType: action,
    sessionStatus,
    totalPauseSeconds,
    endedAt: action === "end" ? now : null,
  };
}

export function normalizeWorkSessionAdjustmentReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized) throw new Error("Informe o motivo do ajuste administrativo.");
  return normalized;
}

export async function updateTeamShift(input: { teamId: number; action: TeamShiftAction; actorUserId: number }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const before = (await tx.select().from(teams).where(eq(teams.id, input.teamId)).limit(1))[0];
    if (!before) throw new Error("Equipe não encontrada.");
    const now = new Date();
    const persistence = resolveTeamShiftPersistence({ startedAt: before.shiftStartedAt, pausedAt: before.shiftPausedAt, endedAt: before.shiftEndsAt, pausedTotalSeconds: before.shiftPausedTotalSeconds }, input.action, now);
    const patch = persistence.teamPatch;
    await tx.update(teams).set(patch).where(eq(teams.id, input.teamId));

    let session = (await tx.select().from(workSessions).where(and(eq(workSessions.teamId, input.teamId), inArray(workSessions.status, ["open", "paused"]))).orderBy(desc(workSessions.startedAt)).limit(1))[0];
    if (input.action === "start") {
      const [created] = await tx.insert(workSessions).values({ teamId: input.teamId, userId: input.actorUserId, startedAt: now, endedAt: null, totalPauseSeconds: 0, status: "open", source: "manual" }).$returningId();
      session = (await tx.select().from(workSessions).where(eq(workSessions.id, created.id)).limit(1))[0];
    } else if (!session && before.shiftStartedAt) {
      const [created] = await tx.insert(workSessions).values({ teamId: input.teamId, userId: input.actorUserId, startedAt: before.shiftStartedAt, endedAt: before.shiftEndsAt, totalPauseSeconds: before.shiftPausedTotalSeconds, status: before.shiftPausedAt ? "paused" : "open", source: "manual" }).$returningId();
      session = (await tx.select().from(workSessions).where(eq(workSessions.id, created.id)).limit(1))[0];
    }
    if (!session) throw new Error("Sessão de jornada não encontrada.");

    await tx.update(workSessions).set({ status: persistence.sessionStatus, totalPauseSeconds: persistence.totalPauseSeconds, endedAt: persistence.endedAt }).where(eq(workSessions.id, session.id));
    await tx.insert(workSessionEvents).values({
      workSessionId: session.id,
      eventType: persistence.eventType,
      occurredAt: now,
      actorUserId: input.actorUserId,
      reason: null,
      metadata: { teamId: input.teamId, legacySnapshotPreserved: true },
    });
    await syncOperationalPresenceTx(tx, {
      teamId: input.teamId,
      userId: session.userId,
      workSessionId: session.id,
      teamStatus: before.status,
      inShift: input.action !== "end",
      shiftPaused: input.action === "pause",
      changedAt: now,
    });

    await tx.insert(auditLogs).values({
      resourceType: "team",
      resourceId: input.teamId,
      action: ({ start: "shift_started", pause: "shift_paused", resume: "shift_resumed", end: "shift_ended" } as const)[input.action],
      actorUserId: input.actorUserId,
      beforeData: { shiftStartedAt: before.shiftStartedAt?.toISOString() ?? null, shiftPausedAt: before.shiftPausedAt?.toISOString() ?? null, shiftEndsAt: before.shiftEndsAt?.toISOString() ?? null, shiftPausedTotalSeconds: before.shiftPausedTotalSeconds },
      afterData: { action: input.action, workSessionId: session.id, eventType: persistence.eventType, shiftStartedAt: patch.shiftStartedAt?.toISOString() ?? before.shiftStartedAt?.toISOString() ?? null, shiftPausedAt: patch.shiftPausedAt === null ? null : patch.shiftPausedAt?.toISOString() ?? before.shiftPausedAt?.toISOString() ?? null, shiftEndsAt: patch.shiftEndsAt === null ? null : patch.shiftEndsAt?.toISOString() ?? before.shiftEndsAt?.toISOString() ?? null, shiftPausedTotalSeconds: patch.shiftPausedTotalSeconds ?? before.shiftPausedTotalSeconds },
    });
  });
}

export async function adjustWorkSession(input: { workSessionId: number; actorUserId: number; reason: string; startedAt?: Date; endedAt?: Date | null; totalPauseSeconds?: number }) {
  const reason = normalizeWorkSessionAdjustmentReason(input.reason);
  if (input.totalPauseSeconds !== undefined && (!Number.isFinite(input.totalPauseSeconds) || input.totalPauseSeconds < 0)) throw new Error("O total de pausa deve ser um valor não negativo.");
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(workSessions).where(eq(workSessions.id, input.workSessionId)).limit(1))[0];
    if (!before) throw new Error("Jornada não encontrada.");
    const patch: Partial<typeof workSessions.$inferInsert> = { source: "admin_adjustment" };
    if (input.startedAt !== undefined) patch.startedAt = input.startedAt;
    if (input.endedAt !== undefined) patch.endedAt = input.endedAt;
    if (input.totalPauseSeconds !== undefined) patch.totalPauseSeconds = Math.floor(input.totalPauseSeconds);
    await tx.update(workSessions).set(patch).where(eq(workSessions.id, input.workSessionId));
    const after = (await tx.select().from(workSessions).where(eq(workSessions.id, input.workSessionId)).limit(1))[0];
    if (!after) throw new Error("Falha ao ajustar a jornada.");
    const now = new Date();
    await tx.insert(workSessionEvents).values({ workSessionId: input.workSessionId, eventType: "adjustment", occurredAt: now, actorUserId: input.actorUserId, reason, metadata: { teamId: after.teamId, userId: after.userId } });
    await tx.insert(auditLogs).values({
      resourceType: "work_session",
      resourceId: input.workSessionId,
      action: "admin_adjustment",
      actorUserId: input.actorUserId,
      beforeData: { startedAt: before.startedAt.toISOString(), endedAt: before.endedAt?.toISOString() ?? null, totalPauseSeconds: before.totalPauseSeconds, status: before.status, source: before.source },
      afterData: { startedAt: after.startedAt.toISOString(), endedAt: after.endedAt?.toISOString() ?? null, totalPauseSeconds: after.totalPauseSeconds, status: after.status, source: after.source, reason },
    });
    return after;
  });
}

export async function getDashboardData(teamId?: number) {
  const db = await requireDb();
  const activeStatuses: IncidentStatus[] = ["triagem", "aguardando_despacho", "despachada", "aceita", "em_atendimento", "pausada"];
  const incidentScope = teamId ? and(inArray(incidents.status, activeStatuses), eq(incidents.assignedTeamId, teamId)) : inArray(incidents.status, activeStatuses);
  const acceptedScope = teamId ? and(isNotNull(incidents.acceptedAt), eq(incidents.assignedTeamId, teamId)) : isNotNull(incidents.acceptedAt);
  const availabilityScope = teamId ? and(eq(teams.active, true), eq(teams.status, "disponivel"), eq(teams.id, teamId)) : and(eq(teams.active, true), eq(teams.status, "disponivel"));
  const [activeRows, availableRows, acceptedRows, queueRows] = await Promise.all([
    db.select({ total: count() }).from(incidents).where(incidentScope),
    db.select({ total: count() }).from(teams).where(availabilityScope),
    db.select({ createdAt: incidents.createdAt, acceptedAt: incidents.acceptedAt }).from(incidents).where(acceptedScope).limit(250),
    db.select().from(incidents).where(incidentScope).orderBy(desc(incidents.createdAt)).limit(24),
  ]);
  const averageResponseSeconds = acceptedRows.length ? Math.round(acceptedRows.reduce((total, row) => total + (row.acceptedAt!.getTime() - row.createdAt.getTime()) / 1000, 0) / acceptedRows.length) : null;
  const weight: Record<IncidentPriority, number> = { critica: 4, alta: 3, media: 2, baixa: 1 };
  return {
    activeIncidents: Number(activeRows[0]?.total ?? 0),
    availableTeams: Number(availableRows[0]?.total ?? 0),
    averageResponseSeconds,
    priorityQueue: queueRows.sort((a, b) => weight[b.priority] - weight[a.priority] || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 8),
  };
}

export type OperationalReportInput = { startDate?: Date; endDate?: Date; teamId?: number };

export async function getOperationalReport(input: OperationalReportInput) {
  const db = await requireDb();
  const clauses = [];
  if (input.startDate) clauses.push(gte(incidents.createdAt, input.startDate));
  if (input.endDate) clauses.push(lte(incidents.createdAt, input.endDate));
  if (input.teamId) clauses.push(eq(incidents.assignedTeamId, input.teamId));
  const where = clauses.length ? and(...clauses) : undefined;
  const rows = await db.select().from(incidents).where(where).orderBy(desc(incidents.createdAt));
  return rows;
}
