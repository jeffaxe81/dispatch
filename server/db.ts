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
import type { IncidentPriority, IncidentStatus, OperationalRole } from "../shared/operations";
import { ENV } from "./_core/env";
import { canUpdateRoleDefinition, isRoleScopeAssignmentValid } from "./accessPolicies";
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

function snapshotIncident(row: typeof incidents.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    priority: row.priority,
    category: row.category,
    origin: row.origin,
    address: row.address,
    assignedTeamId: row.assignedTeamId,
    assignedVehicleId: row.assignedVehicleId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function createIncidentCode() {
  return `OCR-${new Date().getUTCFullYear()}-${nanoid(8).toUpperCase()}`;
}

export async function listIncidents(input: IncidentListInput) {
  const db = await requireDb();
  const filters = [];
  if (input.search) {
    const query = `%${input.search.trim()}%`;
    filters.push(or(like(incidents.code, query), like(incidents.category, query), like(incidents.address, query)));
  }
  if (input.status) filters.push(eq(incidents.status, input.status));
  if (input.priority) filters.push(eq(incidents.priority, input.priority));
  if (input.teamId) filters.push(eq(incidents.assignedTeamId, input.teamId));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, totalRows] = await Promise.all([
    db
      .select({ incident: incidents, teamCode: teams.code, teamName: teams.name, vehiclePrefix: vehicles.prefix })
      .from(incidents)
      .leftJoin(teams, eq(incidents.assignedTeamId, teams.id))
      .leftJoin(vehicles, eq(incidents.assignedVehicleId, vehicles.id))
      .where(where)
      .orderBy(desc(incidents.createdAt))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(incidents).where(where),
  ]);
  return { rows, total: Number(totalRows[0]?.total ?? 0) };
}

export async function getIncidentById(incidentId: number) {
  const db = await requireDb();
  return (
    await db
      .select({ incident: incidents, teamCode: teams.code, teamName: teams.name, vehiclePrefix: vehicles.prefix })
      .from(incidents)
      .leftJoin(teams, eq(incidents.assignedTeamId, teams.id))
      .leftJoin(vehicles, eq(incidents.assignedVehicleId, vehicles.id))
      .where(eq(incidents.id, incidentId))
      .limit(1)
  )[0];
}

export async function createIncident(input: {
  actorUserId: number;
  category: string;
  priority: IncidentPriority;
  origin: typeof incidents.$inferInsert.origin;
  requesterName?: string;
  requesterContact?: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [record] = await tx
      .insert(incidents)
      .values({
        code: createIncidentCode(),
        category: input.category,
        priority: input.priority,
        origin: input.origin,
        requesterName: input.requesterName ?? null,
        requesterContact: input.requesterContact ?? null,
        description: input.description,
        address: input.address,
        latitude: input.latitude.toFixed(7),
        longitude: input.longitude.toFixed(7),
        createdByUserId: input.actorUserId,
      })
      .$returningId();
    const created = (await tx.select().from(incidents).where(eq(incidents.id, record.id)).limit(1))[0];
    if (!created) throw new Error("Falha ao criar ocorrência.");
    await tx.insert(incidentEvents).values({
      incidentId: created.id,
      actorUserId: input.actorUserId,
      eventType: "occurrence_created",
      nextStatus: created.status,
      message: "Ocorrência registrada e encaminhada para triagem.",
      metadata: { origin: created.origin, priority: created.priority },
    });
    await tx.insert(auditLogs).values({
      resourceType: "incident",
      resourceId: created.id,
      action: "create",
      actorUserId: input.actorUserId,
      beforeData: null,
      afterData: snapshotIncident(created),
    });
    return created;
  });
}

export async function updateIncident(input: {
  incidentId: number;
  actorUserId: number;
  category?: string;
  priority?: IncidentPriority;
  requesterName?: string | null;
  requesterContact?: string | null;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1))[0];
    if (!before) throw new Error("Ocorrência não encontrada.");
    const patch: Partial<typeof incidents.$inferInsert> = { updatedAt: new Date() };
    if (input.category !== undefined) patch.category = input.category;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.requesterName !== undefined) patch.requesterName = input.requesterName;
    if (input.requesterContact !== undefined) patch.requesterContact = input.requesterContact;
    if (input.description !== undefined) patch.description = input.description;
    if (input.address !== undefined) patch.address = input.address;
    if (input.latitude !== undefined) patch.latitude = input.latitude.toFixed(7);
    if (input.longitude !== undefined) patch.longitude = input.longitude.toFixed(7);
    await tx.update(incidents).set(patch).where(eq(incidents.id, input.incidentId));
    const after = (await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1))[0];
    if (!after) throw new Error("Falha ao atualizar ocorrência.");
    await tx.insert(incidentEvents).values({
      incidentId: after.id,
      actorUserId: input.actorUserId,
      eventType: "occurrence_updated",
      previousStatus: before.status,
      nextStatus: after.status,
      message: "Dados da ocorrência atualizados.",
    });
    await tx.insert(auditLogs).values({
      resourceType: "incident",
      resourceId: after.id,
      action: "update",
      actorUserId: input.actorUserId,
      beforeData: snapshotIncident(before),
      afterData: snapshotIncident(after),
    });
    return after;
  });
}

export function isIncidentDeletionConfirmationValid(input: { code: string; confirmation: string }) {
  return input.confirmation.trim().toUpperCase() === `EXCLUIR ${input.code}`.toUpperCase();
}

export function buildIncidentDeletionAuditSnapshot(input: { incident: typeof incidents.$inferSelect; assignments: Array<typeof incidentAssignments.$inferSelect>; events: Array<typeof incidentEvents.$inferSelect>; reason: string }) {
  return {
    incident: snapshotIncident(input.incident),
    assignments: input.assignments.map(assignment => ({ id: assignment.id, teamId: assignment.teamId, vehicleId: assignment.vehicleId, status: assignment.status, dispatchedAt: assignment.dispatchedAt })),
    eventCount: input.events.length,
    deletionReason: input.reason,
    deletionMode: "permanent",
  };
}

export async function permanentlyDeleteIncident(input: { incidentId: number; actorUserId: number; reason: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const incident = (await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1))[0];
    if (!incident) throw new Error("Ocorrência não encontrada.");
    const [assignments, events] = await Promise.all([
      tx.select().from(incidentAssignments).where(eq(incidentAssignments.incidentId, input.incidentId)),
      tx.select().from(incidentEvents).where(eq(incidentEvents.incidentId, input.incidentId)),
    ]);
    const affectedTeamIds = Array.from(new Set(assignments.map(assignment => assignment.teamId)));
    const auditSnapshot = buildIncidentDeletionAuditSnapshot({ incident, assignments, events, reason: input.reason.trim() });
    await tx.insert(auditLogs).values({
      resourceType: "incident",
      resourceId: incident.id,
      action: "permanent_delete",
      actorUserId: input.actorUserId,
      beforeData: auditSnapshot,
      afterData: { deleted: true, deletedAt: new Date().toISOString(), deletionMode: "permanent" },
    });
    await tx.delete(incidents).where(eq(incidents.id, incident.id));
    if (affectedTeamIds.length) {
      const teamsWithOtherActiveIncidents = await tx.select({ teamId: incidents.assignedTeamId }).from(incidents).where(and(inArray(incidents.assignedTeamId, affectedTeamIds), inArray(incidents.status, ["triagem", "aguardando_despacho", "despachada", "aceita", "em_atendimento", "pausada"])));
      const busyTeamIds = new Set(teamsWithOtherActiveIncidents.map(row => row.teamId).filter((id): id is number => id !== null));
      const availableTeamIds = affectedTeamIds.filter(teamId => !busyTeamIds.has(teamId));
      if (availableTeamIds.length) await tx.update(teams).set({ status: "disponivel" }).where(inArray(teams.id, availableTeamIds));
    }
    return { incidentCode: incident.code, auditPreserved: true };
  });
}

export const SOLUTION_RESET_CONFIRMATIONS = {
  operational: "ZERAR DADOS OPERACIONAIS",
  total: "ZERAR SOLUÇÃO AXE DISPATCH",
} as const;

export type SolutionResetScope = keyof typeof SOLUTION_RESET_CONFIRMATIONS;
export const SOLUTION_RESET_CONFIRMATION = SOLUTION_RESET_CONFIRMATIONS.operational;

export function isSolutionResetConfirmationValid(scope: SolutionResetScope, confirmation: string) {
  return confirmation.trim().toUpperCase() === SOLUTION_RESET_CONFIRMATIONS[scope];
}

type SolutionResetImpact = {
  occurrences: number;
  assignments: number;
  evidenceReferences: number;
  occurrenceEvents: number;
  teamLocations: number;
  workflows: number;
  workflowVersions: number;
  workflowExecutions: number;
  workflowExecutionSteps: number;
  integrationConnections: number;
  integrationCredentials: number;
  integrationWebhooks: number;
  integrationLogs: number;
  importedOpenapiSpecs: number;
  importedOpenapiOperations: number;
  users: number;
  userProfiles: number;
  userRoleAssignments: number;
  teams: number;
  vehicles: number;
};

function resetImpactTotal(impact: SolutionResetImpact) {
  return Object.values(impact).reduce((total, value) => total + value, 0);
}

export async function getSolutionResetPreview(input: { scope: SolutionResetScope; actorUserId: number }) {
  const db = await requireDb();
  const totalScope = input.scope === "total";
  const [occurrences, assignments, evidenceReferences, occurrenceEvents, teamLocationsCount, workflowsCount, workflowVersionsCount, workflowExecutionsCount, workflowExecutionStepsCount, integrationConnectionsCount, integrationCredentialsCount, integrationWebhooksCount, integrationLogsCount, importedOpenapiSpecs, importedOpenapiOperations, usersCount, userProfilesCount, userRoleAssignmentsCount, teamsCount, vehiclesCount] = await Promise.all([
    db.select({ total: count() }).from(incidents),
    db.select({ total: count() }).from(incidentAssignments),
    db.select({ total: count() }).from(incidentEvidence),
    db.select({ total: count() }).from(incidentEvents),
    db.select({ total: count() }).from(teamLocations),
    db.select({ total: count() }).from(workflows),
    db.select({ total: count() }).from(workflowVersions),
    db.select({ total: count() }).from(workflowExecutions),
    db.select({ total: count() }).from(workflowExecutionSteps),
    db.select({ total: count() }).from(integrationConnections),
    db.select({ total: count() }).from(integrationCredentials),
    db.select({ total: count() }).from(integrationWebhooks),
    db.select({ total: count() }).from(integrationLogs),
    db.select({ total: count() }).from(integrationOpenapiSpecs),
    db.select({ total: count() }).from(integrationOpenapiOperations),
    totalScope ? db.select({ total: count() }).from(users).where(ne(users.id, input.actorUserId)) : Promise.resolve([{ total: 0 }]),
    totalScope ? db.select({ total: count() }).from(userProfiles).where(ne(userProfiles.userId, input.actorUserId)) : Promise.resolve([{ total: 0 }]),
    totalScope ? db.select({ total: count() }).from(userRoleAssignments).where(ne(userRoleAssignments.userId, input.actorUserId)) : Promise.resolve([{ total: 0 }]),
    totalScope ? db.select({ total: count() }).from(teams) : Promise.resolve([{ total: 0 }]),
    totalScope ? db.select({ total: count() }).from(vehicles) : Promise.resolve([{ total: 0 }]),
  ]);
  const impact: SolutionResetImpact = {
    occurrences: Number(occurrences[0]?.total ?? 0),
    assignments: Number(assignments[0]?.total ?? 0),
    evidenceReferences: Number(evidenceReferences[0]?.total ?? 0),
    occurrenceEvents: Number(occurrenceEvents[0]?.total ?? 0),
    teamLocations: Number(teamLocationsCount[0]?.total ?? 0),
    workflows: Number(workflowsCount[0]?.total ?? 0),
    workflowVersions: Number(workflowVersionsCount[0]?.total ?? 0),
    workflowExecutions: Number(workflowExecutionsCount[0]?.total ?? 0),
    workflowExecutionSteps: Number(workflowExecutionStepsCount[0]?.total ?? 0),
    integrationConnections: Number(integrationConnectionsCount[0]?.total ?? 0),
    integrationCredentials: Number(integrationCredentialsCount[0]?.total ?? 0),
    integrationWebhooks: Number(integrationWebhooksCount[0]?.total ?? 0),
    integrationLogs: Number(integrationLogsCount[0]?.total ?? 0),
    importedOpenapiSpecs: Number(importedOpenapiSpecs[0]?.total ?? 0),
    importedOpenapiOperations: Number(importedOpenapiOperations[0]?.total ?? 0),
    users: Number(usersCount[0]?.total ?? 0),
    userProfiles: Number(userProfilesCount[0]?.total ?? 0),
    userRoleAssignments: Number(userRoleAssignmentsCount[0]?.total ?? 0),
    teams: Number(teamsCount[0]?.total ?? 0),
    vehicles: Number(vehiclesCount[0]?.total ?? 0),
  };
  return {
    impact,
    totalRecords: resetImpactTotal(impact),
    scope: input.scope,
    preserved: totalScope ? ["sessão e perfil do Super Administrador que executa a ação", "catálogo de papéis e permissões", "estrutura organizacional", "configurações gerais", "catálogo interno de eventos", "log de operações"] : ["usuários e perfis", "papéis, permissões e escopos", "equipes e viaturas cadastradas", "configurações gerais", "catálogo interno de eventos", "log de operações"],
    evidenceStorageNote: "As referências de evidências são removidas; os objetos de armazenamento tornam-se inacessíveis após a remoção das chaves do banco.",
  };
}

export async function resetSolutionOperationalData(input: { actorUserId: number; reason: string; confirmation: string; scope: SolutionResetScope }) {
  if (!isSolutionResetConfirmationValid(input.scope, input.confirmation)) throw new Error(`Confirmação inválida. Digite exatamente \"${SOLUTION_RESET_CONFIRMATIONS[input.scope]}\".`);
  const db = await requireDb();
  const reason = input.reason.trim();
  if (reason.length < 10) throw new Error("Informe um motivo com pelo menos 10 caracteres.");

  return db.transaction(async tx => {
    const totalScope = input.scope === "total";
    const [occurrences, assignments, evidenceReferences, occurrenceEvents, teamLocationsCount, workflowsCount, workflowVersionsCount, workflowExecutionsCount, workflowExecutionStepsCount, integrationConnectionsCount, integrationCredentialsCount, integrationWebhooksCount, integrationLogsCount, importedOpenapiSpecs, importedOpenapiOperations, usersCount, userProfilesCount, userRoleAssignmentsCount, teamsCount, vehiclesCount] = await Promise.all([
      tx.select({ total: count() }).from(incidents),
      tx.select({ total: count() }).from(incidentAssignments),
      tx.select({ total: count() }).from(incidentEvidence),
      tx.select({ total: count() }).from(incidentEvents),
      tx.select({ total: count() }).from(teamLocations),
      tx.select({ total: count() }).from(workflows),
      tx.select({ total: count() }).from(workflowVersions),
      tx.select({ total: count() }).from(workflowExecutions),
      tx.select({ total: count() }).from(workflowExecutionSteps),
      tx.select({ total: count() }).from(integrationConnections),
      tx.select({ total: count() }).from(integrationCredentials),
      tx.select({ total: count() }).from(integrationWebhooks),
      tx.select({ total: count() }).from(integrationLogs),
      tx.select({ total: count() }).from(integrationOpenapiSpecs),
      tx.select({ total: count() }).from(integrationOpenapiOperations),
      totalScope ? tx.select({ total: count() }).from(users).where(ne(users.id, input.actorUserId)) : Promise.resolve([{ total: 0 }]),
      totalScope ? tx.select({ total: count() }).from(userProfiles).where(ne(userProfiles.userId, input.actorUserId)) : Promise.resolve([{ total: 0 }]),
      totalScope ? tx.select({ total: count() }).from(userRoleAssignments).where(ne(userRoleAssignments.userId, input.actorUserId)) : Promise.resolve([{ total: 0 }]),
      totalScope ? tx.select({ total: count() }).from(teams) : Promise.resolve([{ total: 0 }]),
      totalScope ? tx.select({ total: count() }).from(vehicles) : Promise.resolve([{ total: 0 }]),
    ]);
    const impact: SolutionResetImpact = {
      occurrences: Number(occurrences[0]?.total ?? 0),
      assignments: Number(assignments[0]?.total ?? 0),
      evidenceReferences: Number(evidenceReferences[0]?.total ?? 0),
      occurrenceEvents: Number(occurrenceEvents[0]?.total ?? 0),
      teamLocations: Number(teamLocationsCount[0]?.total ?? 0),
      workflows: Number(workflowsCount[0]?.total ?? 0),
      workflowVersions: Number(workflowVersionsCount[0]?.total ?? 0),
      workflowExecutions: Number(workflowExecutionsCount[0]?.total ?? 0),
      workflowExecutionSteps: Number(workflowExecutionStepsCount[0]?.total ?? 0),
      integrationConnections: Number(integrationConnectionsCount[0]?.total ?? 0),
      integrationCredentials: Number(integrationCredentialsCount[0]?.total ?? 0),
      integrationWebhooks: Number(integrationWebhooksCount[0]?.total ?? 0),
      integrationLogs: Number(integrationLogsCount[0]?.total ?? 0),
      importedOpenapiSpecs: Number(importedOpenapiSpecs[0]?.total ?? 0),
      importedOpenapiOperations: Number(importedOpenapiOperations[0]?.total ?? 0),
      users: Number(usersCount[0]?.total ?? 0),
      userProfiles: Number(userProfilesCount[0]?.total ?? 0),
      userRoleAssignments: Number(userRoleAssignmentsCount[0]?.total ?? 0),
      teams: Number(teamsCount[0]?.total ?? 0),
      vehicles: Number(vehiclesCount[0]?.total ?? 0),
    };
    const preview = {
      impact,
      totalRecords: resetImpactTotal(impact),
      scope: input.scope,
      preserved: totalScope ? ["sessão e perfil do Super Administrador que executa a ação", "catálogo de papéis e permissões", "estrutura organizacional", "configurações gerais", "catálogo interno de eventos", "log de operações"] : ["usuários e perfis", "papéis, permissões e escopos", "equipes e viaturas cadastradas", "configurações gerais", "catálogo interno de eventos", "log de operações"],
      evidenceStorageNote: "As referências de evidências são removidas; os objetos de armazenamento tornam-se inacessíveis após a remoção das chaves do banco.",
    };
    await tx.delete(integrationLogs);
    await tx.delete(integrationWebhooks);
    await tx.delete(integrationOpenapiSpecs);
    await tx.delete(workflows);
    await tx.delete(integrationConnections);
    await tx.delete(integrationCredentials);
    await tx.delete(teamLocations);
    await tx.delete(incidents);
    if (totalScope) {
      await tx.delete(userRoleAssignments).where(ne(userRoleAssignments.userId, input.actorUserId));
      await tx.delete(userProfiles).where(ne(userProfiles.userId, input.actorUserId));
      await tx.delete(users).where(ne(users.id, input.actorUserId));
      await tx.delete(vehicles);
      await tx.delete(teams);
    }
    const completedAt = new Date().toISOString();
    await tx.insert(auditLogs).values({
      resourceType: "solution_reset",
      resourceId: 0,
      action: "operational_data_reset",
      actorUserId: input.actorUserId,
      beforeData: {
        resetScope: input.scope === "total" ? "total_solution_data" : "operational_and_simulation_data",
        reason,
        impact: preview.impact,
        totalRecords: preview.totalRecords,
        preserved: preview.preserved,
        evidenceStorageNote: preview.evidenceStorageNote,
      },
      afterData: {
        completed: true,
        completedAt,
        clearedRecordCount: preview.totalRecords,
        auditPreserved: true,
      },
    });
    return { ...preview, completedAt, auditPreserved: true };
  });
}

export async function listOperationLogs(input: { page: number; pageSize: number; resourceType?: string; search?: string }) {
  const db = await requireDb();
  const normalizedSearch = input.search?.trim();
  const where = and(
    input.resourceType ? eq(auditLogs.resourceType, input.resourceType) : undefined,
    normalizedSearch ? or(
      like(auditLogs.action, `%${normalizedSearch}%`),
      like(auditLogs.resourceType, `%${normalizedSearch}%`),
      like(users.name, `%${normalizedSearch}%`),
      like(users.email, `%${normalizedSearch}%`),
    ) : undefined,
  );
  const [rows, totalRows] = await Promise.all([
    db.select({ audit: auditLogs, actorName: users.name, actorEmail: users.email }).from(auditLogs).leftJoin(users, eq(auditLogs.actorUserId, users.id)).where(where).orderBy(desc(auditLogs.createdAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);
  return { rows, total: Number(totalRows[0]?.total ?? 0) };
}

export async function transitionIncident(input: { incidentId: number; actorUserId: number; nextStatus: IncidentStatus; note: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1))[0];
    if (!before) throw new Error("Ocorrência não encontrada.");
    const now = new Date();
    const patch: Partial<typeof incidents.$inferInsert> = { status: input.nextStatus, updatedAt: now };
    if (input.nextStatus === "aceita") patch.acceptedAt = now;
    if (input.nextStatus === "em_atendimento") patch.startedAt = now;
    if (input.nextStatus === "concluida") {
      patch.completedAt = now;
      patch.closedByUserId = input.actorUserId;
      patch.closeSummary = input.note;
    }
    if (input.nextStatus === "cancelada") patch.cancelledAt = now;
    await tx.update(incidents).set(patch).where(eq(incidents.id, input.incidentId));
    const after = (await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1))[0];
    if (!after) throw new Error("Falha ao alterar status.");
    await tx.insert(incidentEvents).values({
      incidentId: after.id,
      actorUserId: input.actorUserId,
      teamId: after.assignedTeamId,
      eventType: "status_changed",
      previousStatus: before.status,
      nextStatus: after.status,
      message: input.note,
    });
    await tx.insert(auditLogs).values({
      resourceType: "incident",
      resourceId: after.id,
      action: "status_transition",
      actorUserId: input.actorUserId,
      beforeData: snapshotIncident(before),
      afterData: snapshotIncident(after),
    });
    return after;
  });
}

export async function assignTeamToIncident(input: { incidentId: number; teamId: number; vehicleId?: number; actorUserId: number; estimatedArrivalMinutes?: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1))[0];
    const team = (await tx.select().from(teams).where(eq(teams.id, input.teamId)).limit(1))[0];
    if (!before) throw new Error("Ocorrência não encontrada.");
    if (!team || !team.active || team.status === "indisponivel") throw new Error("Equipe indisponível para despacho.");
    const now = new Date();
    const [assignment] = await tx.insert(incidentAssignments).values({
      incidentId: input.incidentId,
      teamId: input.teamId,
      vehicleId: input.vehicleId ?? null,
      dispatchedByUserId: input.actorUserId,
      estimatedArrivalMinutes: input.estimatedArrivalMinutes ?? null,
      status: "pendente",
      dispatchedAt: now,
    }).$returningId();
    await tx.update(incidents).set({ assignedTeamId: input.teamId, assignedVehicleId: input.vehicleId ?? null, status: "despachada", dispatchedAt: now }).where(eq(incidents.id, input.incidentId));
    await tx.update(teams).set({ status: "em_deslocamento" }).where(eq(teams.id, input.teamId));
    const after = (await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1))[0];
    if (!after) throw new Error("Falha ao registrar despacho.");
    await tx.insert(incidentEvents).values({
      incidentId: after.id,
      actorUserId: input.actorUserId,
      teamId: input.teamId,
      eventType: "team_dispatched",
      previousStatus: before.status,
      nextStatus: after.status,
      message: `Equipe ${team.code} designada para atendimento.`,
      metadata: { vehicleId: input.vehicleId ?? null, estimatedArrivalMinutes: input.estimatedArrivalMinutes ?? null },
    });
    await tx.insert(auditLogs).values({ resourceType: "incident", resourceId: after.id, action: "team_assigned", actorUserId: input.actorUserId, beforeData: snapshotIncident(before), afterData: snapshotIncident(after) });
    await tx.insert(auditLogs).values({
      resourceType: "assignment",
      resourceId: assignment.id,
      action: "create",
      actorUserId: input.actorUserId,
      beforeData: null,
      afterData: { incidentId: input.incidentId, teamId: input.teamId, vehicleId: input.vehicleId ?? null, status: "pendente" },
    });
    return after;
  });
}

export async function respondToAssignment(input: { incidentId: number; teamId: number; actorUserId: number; accepted: boolean; note?: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const assignment = (await tx.select().from(incidentAssignments).where(and(eq(incidentAssignments.incidentId, input.incidentId), eq(incidentAssignments.teamId, input.teamId))).orderBy(desc(incidentAssignments.createdAt)).limit(1))[0];
    const before = (await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1))[0];
    if (!assignment || assignment.status !== "pendente") throw new Error("Não há despacho pendente para esta equipe.");
    if (!before) throw new Error("Ocorrência não encontrada.");
    const now = new Date();
    const nextStatus: IncidentStatus = input.accepted ? "aceita" : "aguardando_despacho";
    await tx.update(incidentAssignments).set({ status: input.accepted ? "aceita" : "recusada", acceptedAt: input.accepted ? now : null, declinedAt: input.accepted ? null : now, responseNote: input.note ?? null }).where(eq(incidentAssignments.id, assignment.id));
    await tx.update(incidents).set({ status: nextStatus, acceptedAt: input.accepted ? now : null, assignedTeamId: input.accepted ? input.teamId : null, assignedVehicleId: input.accepted ? before.assignedVehicleId : null }).where(eq(incidents.id, input.incidentId));
    await tx.update(teams).set({ status: input.accepted ? "em_deslocamento" : "disponivel" }).where(eq(teams.id, input.teamId));
    const after = (await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1))[0];
    if (!after) throw new Error("Falha ao responder despacho.");
    await tx.insert(incidentEvents).values({ incidentId: after.id, actorUserId: input.actorUserId, teamId: input.teamId, eventType: input.accepted ? "dispatch_accepted" : "dispatch_declined", previousStatus: before.status, nextStatus: after.status, message: input.accepted ? "Despacho aceito pela equipe." : `Despacho recusado. ${input.note ?? ""}`.trim() });
    await tx.insert(auditLogs).values({ resourceType: "incident", resourceId: after.id, action: input.accepted ? "assignment_accepted" : "assignment_declined", actorUserId: input.actorUserId, beforeData: snapshotIncident(before), afterData: snapshotIncident(after) });
    await tx.insert(auditLogs).values({
      resourceType: "assignment",
      resourceId: assignment.id,
      action: input.accepted ? "accept" : "decline",
      actorUserId: input.actorUserId,
      beforeData: { status: "pendente", responseNote: null },
      afterData: { status: input.accepted ? "aceita" : "recusada", responseNote: input.note ?? null },
    });
    return after;
  });
}

export async function recordTeamLocation(input: { teamId: number; userId: number; latitude: number; longitude: number; accuracyMeters?: number; speedMetersPerSecond?: number; headingDegrees?: number; capturedAt: Date }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.insert(teamLocations).values({
      teamId: input.teamId,
      userId: input.userId,
      latitude: input.latitude.toFixed(7),
      longitude: input.longitude.toFixed(7),
      accuracyMeters: input.accuracyMeters?.toFixed(2) ?? null,
      speedMetersPerSecond: input.speedMetersPerSecond?.toFixed(2) ?? null,
      headingDegrees: input.headingDegrees?.toFixed(2) ?? null,
      capturedAt: input.capturedAt,
    });
    await tx.update(teams).set({ lastLatitude: input.latitude.toFixed(7), lastLongitude: input.longitude.toFixed(7), lastLocationAt: input.capturedAt }).where(eq(teams.id, input.teamId));
    await tx.insert(auditLogs).values({ resourceType: "team", resourceId: input.teamId, action: "location_received", actorUserId: input.userId, beforeData: null, afterData: { latitude: input.latitude, longitude: input.longitude, capturedAt: input.capturedAt.toISOString() } });
  });
}

const evidenceFileTypes = {
  "image/jpeg": { extension: "jpg", matches: (bytes: Buffer) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: "png", matches: (bytes: Buffer) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { extension: "webp", matches: (bytes: Buffer) => bytes.length >= 12 && bytes.subarray(0, 4).equals(Buffer.from("RIFF")) && bytes.subarray(8, 12).equals(Buffer.from("WEBP")) },
  "application/pdf": { extension: "pdf", matches: (bytes: Buffer) => bytes.length >= 5 && bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) },
} as const;

export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
export type EvidenceContentType = keyof typeof evidenceFileTypes;

const profilePhotoFileTypes = {
  "image/jpeg": evidenceFileTypes["image/jpeg"],
  "image/png": evidenceFileTypes["image/png"],
  "image/webp": evidenceFileTypes["image/webp"],
} as const;

export const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
export type ProfilePhotoContentType = keyof typeof profilePhotoFileTypes;

function evidenceFilename(name: string, extension: string) {
  const stem = name.trim().replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "evidencia";
  return `${stem}.${extension}`;
}

export function decodeEvidenceBase64(input: { dataBase64: string; contentType: string }) {
  const type = evidenceFileTypes[input.contentType as EvidenceContentType];
  if (!type) throw new Error("São aceitas somente imagens JPEG, PNG, WEBP ou documentos PDF.");
  const normalized = input.dataBase64.replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) throw new Error("O conteúdo do anexo é inválido.");
  const bytes = Buffer.from(normalized, "base64");
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES) throw new Error("Cada evidência deve ter no máximo 8 MB.");
  if (!type.matches(bytes)) throw new Error("O conteúdo do arquivo não corresponde ao tipo declarado.");
  return { bytes, extension: type.extension };
}

export function decodeProfilePhotoBase64(input: { dataBase64: string; contentType: string }) {
  const type = profilePhotoFileTypes[input.contentType as ProfilePhotoContentType];
  if (!type) throw new Error("A foto de perfil deve ser uma imagem JPEG, PNG ou WEBP.");
  const normalized = input.dataBase64.replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) throw new Error("O conteúdo da foto de perfil é inválido.");
  const bytes = Buffer.from(normalized, "base64");
  if (!bytes.length || bytes.length > MAX_PROFILE_PHOTO_BYTES) throw new Error("A foto de perfil deve ter no máximo 2 MB.");
  if (!type.matches(bytes)) throw new Error("O conteúdo da foto não corresponde ao tipo declarado.");
  return { bytes, extension: type.extension };
}

export async function getOwnProfilePhoto(userId: number) {
  const db = await requireDb();
  const profile = (await db.select({ storageKey: userProfiles.avatarStorageKey, contentType: userProfiles.avatarContentType, updatedAt: userProfiles.avatarUpdatedAt }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1))[0];
  if (!profile?.storageKey) return null;
  return { contentType: profile.contentType, updatedAt: profile.updatedAt, url: (await storageGet(profile.storageKey)).url };
}

export async function uploadUserProfilePhoto(input: { userId: number; actorUserId: number; fileName: string; contentType: string; dataBase64: string }) {
  const { bytes, extension } = decodeProfilePhotoBase64(input);
  const db = await requireDb();
  const safeName = evidenceFilename(input.fileName, extension).replace(/^evidencia\./, "perfil.");
  const stored = await storagePut(`profile-photos/${input.userId}/${Date.now()}-${safeName}`, bytes, input.contentType);
  return db.transaction(async tx => {
    const user = (await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!user) throw new Error("Usuário não encontrado.");
    const before = (await tx.select({ storageKey: userProfiles.avatarStorageKey, contentType: userProfiles.avatarContentType, updatedAt: userProfiles.avatarUpdatedAt }).from(userProfiles).where(eq(userProfiles.userId, input.userId)).limit(1))[0];
    const photoPatch = { userId: input.userId, avatarStorageKey: stored.key, avatarContentType: input.contentType, avatarUpdatedAt: new Date() };
    await tx.insert(userProfiles).values(photoPatch).onDuplicateKeyUpdate({ set: photoPatch });
    await tx.insert(auditLogs).values({
      resourceType: "user",
      resourceId: input.userId,
      action: "profile_photo_updated",
      actorUserId: input.actorUserId,
      beforeData: { hasProfilePhoto: Boolean(before?.storageKey), contentType: before?.contentType ?? null, updatedAt: before?.updatedAt?.toISOString() ?? null },
      afterData: { hasProfilePhoto: true, contentType: input.contentType, byteSize: bytes.length, storagePersisted: true, updatedAt: photoPatch.avatarUpdatedAt.toISOString() },
    });
    return { contentType: input.contentType, byteSize: bytes.length, updatedAt: photoPatch.avatarUpdatedAt, url: stored.url };
  });
}

export async function listIncidentEvidence(incidentId: number) {
  const db = await requireDb();
  const rows = await db.select({ evidence: incidentEvidence, uploadedByName: users.name }).from(incidentEvidence).leftJoin(users, eq(users.id, incidentEvidence.uploadedByUserId)).where(eq(incidentEvidence.incidentId, incidentId)).orderBy(desc(incidentEvidence.createdAt));
  return Promise.all(rows.map(async row => ({ id: row.evidence.id, fileName: row.evidence.fileName, contentType: row.evidence.contentType, byteSize: row.evidence.byteSize, description: row.evidence.description, uploadedByUserId: row.evidence.uploadedByUserId, uploadedByName: row.uploadedByName, createdAt: row.evidence.createdAt, url: (await storageGet(row.evidence.storageKey)).url })));
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

export async function updateTeamStatus(input: { teamId: number; status: typeof teams.$inferInsert.status; actorUserId: number }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const before = (await tx.select().from(teams).where(eq(teams.id, input.teamId)).limit(1))[0];
    if (!before) throw new Error("Equipe não encontrada.");
    await tx.update(teams).set({ status: input.status }).where(eq(teams.id, input.teamId));
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

export async function updateTeamShift(input: { teamId: number; action: TeamShiftAction; actorUserId: number }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const before = (await tx.select().from(teams).where(eq(teams.id, input.teamId)).limit(1))[0];
    if (!before) throw new Error("Equipe não encontrada.");
    const now = new Date();
    const patch = resolveTeamShiftAction({ startedAt: before.shiftStartedAt, pausedAt: before.shiftPausedAt, endedAt: before.shiftEndsAt, pausedTotalSeconds: before.shiftPausedTotalSeconds }, input.action, now);
    await tx.update(teams).set(patch).where(eq(teams.id, input.teamId));
    await tx.insert(auditLogs).values({
      resourceType: "team",
      resourceId: input.teamId,
      action: ({ start: "shift_started", pause: "shift_paused", resume: "shift_resumed", end: "shift_ended" } as const)[input.action],
      actorUserId: input.actorUserId,
      beforeData: { shiftStartedAt: before.shiftStartedAt?.toISOString() ?? null, shiftPausedAt: before.shiftPausedAt?.toISOString() ?? null, shiftEndsAt: before.shiftEndsAt?.toISOString() ?? null, shiftPausedTotalSeconds: before.shiftPausedTotalSeconds },
      afterData: { action: input.action, shiftStartedAt: patch.shiftStartedAt?.toISOString() ?? before.shiftStartedAt?.toISOString() ?? null, shiftPausedAt: patch.shiftPausedAt === null ? null : patch.shiftPausedAt?.toISOString() ?? before.shiftPausedAt?.toISOString() ?? null, shiftEndsAt: patch.shiftEndsAt === null ? null : patch.shiftEndsAt?.toISOString() ?? before.shiftEndsAt?.toISOString() ?? null, shiftPausedTotalSeconds: patch.shiftPausedTotalSeconds ?? before.shiftPausedTotalSeconds },
    });
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
type OperationalReportRow = { incident: typeof incidents.$inferSelect; teamCode: string | null; teamName: string | null };
const reportStatuses = ["triagem", "aguardando_despacho", "despachada", "aceita", "em_atendimento", "pausada", "concluida", "cancelada"] as const;
const reportPriorities = ["baixa", "media", "alta", "critica"] as const;

function summarizeOperationalRows(rows: OperationalReportRow[]) {
  const activeStatuses: IncidentStatus[] = ["triagem", "aguardando_despacho", "despachada", "aceita", "em_atendimento", "pausada"];
  const responseMinutes = rows.flatMap(({ incident }) => incident.acceptedAt ? [(incident.acceptedAt.getTime() - incident.createdAt.getTime()) / 60_000] : []);
  const resolutionMinutes = rows.flatMap(({ incident }) => incident.completedAt ? [(incident.completedAt.getTime() - incident.createdAt.getTime()) / 60_000] : []);
  const byStatus = Object.fromEntries(reportStatuses.map(status => [status, rows.filter(row => row.incident.status === status).length])) as Record<(typeof reportStatuses)[number], number>;
  const byPriority = Object.fromEntries(reportPriorities.map(priority => [priority, rows.filter(row => row.incident.priority === priority).length])) as Record<(typeof reportPriorities)[number], number>;
  const average = (values: number[]) => values.length ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10 : null;
  return { metrics: { total: rows.length, active: rows.filter(row => activeStatuses.includes(row.incident.status)).length, completed: byStatus.concluida, cancelled: byStatus.cancelada, criticalOrHigh: byPriority.critica + byPriority.alta, averageResponseMinutes: average(responseMinutes), averageResolutionMinutes: average(resolutionMinutes) }, byStatus, byPriority };
}

function compareMetric(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  const absolute = Math.round((current - previous) * 10) / 10;
  return { absolute, percentage: previous === 0 ? (current === 0 ? 0 : null) : Math.round((absolute / previous) * 1000) / 10 };
}

export async function getOperationalReport(input: OperationalReportInput) {
  if (input.startDate && input.endDate && input.startDate > input.endDate) throw new Error("O período inicial não pode ser posterior ao período final.");
  const db = await requireDb();
  const loadRows = async (range: OperationalReportInput): Promise<OperationalReportRow[]> => {
    const filters = [];
    if (range.startDate) filters.push(gte(incidents.createdAt, range.startDate));
    if (range.endDate) filters.push(lte(incidents.createdAt, range.endDate));
    if (range.teamId) filters.push(eq(incidents.assignedTeamId, range.teamId));
    return db.select({ incident: incidents, teamCode: teams.code, teamName: teams.name }).from(incidents).leftJoin(teams, eq(incidents.assignedTeamId, teams.id)).where(filters.length ? and(...filters) : undefined).orderBy(desc(incidents.createdAt));
  };
  const rows = await loadRows(input);
  const summary = summarizeOperationalRows(rows);
  const previousPeriod = input.startDate && input.endDate ? (() => {
    const duration = input.endDate.getTime() - input.startDate.getTime();
    const endDate = new Date(input.startDate.getTime() - 1);
    return { startDate: new Date(endDate.getTime() - duration), endDate, teamId: input.teamId };
  })() : null;
  const previousRows = previousPeriod ? await loadRows(previousPeriod) : null;
  const previous = previousRows ? summarizeOperationalRows(previousRows) : null;
  return {
    generatedAt: new Date(),
    filters: { startDate: input.startDate ?? null, endDate: input.endDate ?? null, teamId: input.teamId ?? null },
    metrics: summary.metrics,
    byStatus: summary.byStatus,
    byPriority: summary.byPriority,
    comparison: previous && previousPeriod ? { period: previousPeriod, metrics: previous.metrics, changes: { total: compareMetric(summary.metrics.total, previous.metrics.total), active: compareMetric(summary.metrics.active, previous.metrics.active), completed: compareMetric(summary.metrics.completed, previous.metrics.completed), averageResponseMinutes: compareMetric(summary.metrics.averageResponseMinutes, previous.metrics.averageResponseMinutes), averageResolutionMinutes: compareMetric(summary.metrics.averageResolutionMinutes, previous.metrics.averageResolutionMinutes) } } : null,
    records: rows.map(({ incident, teamCode, teamName }) => ({ code: incident.code, status: incident.status, priority: incident.priority, category: incident.category, teamCode: teamCode ?? null, teamName: teamName ?? null, createdAt: incident.createdAt, acceptedAt: incident.acceptedAt, completedAt: incident.completedAt })),
  };
}

export async function listDashboardSavedFilters(userId: number) {
  const db = await requireDb();
  return db.select().from(dashboardSavedFilters).where(eq(dashboardSavedFilters.userId, userId)).orderBy(desc(dashboardSavedFilters.isDefault), dashboardSavedFilters.name);
}

export async function saveDashboardFilter(input: { userId: number; name: string; startDate?: Date; endDate?: Date; teamId?: number; isDefault?: boolean }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    if (input.startDate && input.endDate && input.startDate > input.endDate) throw new Error("O período inicial não pode ser posterior ao período final.");
    if (input.isDefault) await tx.update(dashboardSavedFilters).set({ isDefault: false }).where(eq(dashboardSavedFilters.userId, input.userId));
    const values = { userId: input.userId, name: input.name.trim(), startDate: input.startDate ?? null, endDate: input.endDate ?? null, teamId: input.teamId ?? null, isDefault: input.isDefault ?? false };
    const before = (await tx.select().from(dashboardSavedFilters).where(and(eq(dashboardSavedFilters.userId, input.userId), eq(dashboardSavedFilters.name, values.name))).limit(1))[0] ?? null;
    if (before) await tx.update(dashboardSavedFilters).set(values).where(eq(dashboardSavedFilters.id, before.id));
    else await tx.insert(dashboardSavedFilters).values(values);
    const after = (await tx.select().from(dashboardSavedFilters).where(and(eq(dashboardSavedFilters.userId, input.userId), eq(dashboardSavedFilters.name, values.name))).limit(1))[0];
    await tx.insert(auditLogs).values({ resourceType: "dashboard_filter", resourceId: after?.id ?? 0, action: before ? "update" : "create", actorUserId: input.userId, beforeData: before ? { name: before.name, startDate: before.startDate?.toISOString() ?? null, endDate: before.endDate?.toISOString() ?? null, teamId: before.teamId, isDefault: before.isDefault } : null, afterData: { name: values.name, startDate: values.startDate?.toISOString() ?? null, endDate: values.endDate?.toISOString() ?? null, teamId: values.teamId, isDefault: values.isDefault } });
    return after;
  });
}

export async function deleteDashboardFilter(input: { userId: number; filterId: number }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const before = (await tx.select().from(dashboardSavedFilters).where(and(eq(dashboardSavedFilters.id, input.filterId), eq(dashboardSavedFilters.userId, input.userId))).limit(1))[0];
    if (!before) throw new Error("Filtro salvo não encontrado.");
    await tx.delete(dashboardSavedFilters).where(eq(dashboardSavedFilters.id, before.id));
    await tx.insert(auditLogs).values({ resourceType: "dashboard_filter", resourceId: before.id, action: "delete", actorUserId: input.userId, beforeData: { name: before.name, startDate: before.startDate?.toISOString() ?? null, endDate: before.endDate?.toISOString() ?? null, teamId: before.teamId, isDefault: before.isDefault }, afterData: null });
  });
}

export async function listHelpFavorites(userId: number) {
  const db = await requireDb();
  return db.select().from(helpFavorites).where(eq(helpFavorites.userId, userId)).orderBy(desc(helpFavorites.createdAt));
}

export async function addHelpFavorite(input: { userId: number; contentType: "manual" | "faq"; contentId: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const existing = (await tx.select().from(helpFavorites).where(and(eq(helpFavorites.userId, input.userId), eq(helpFavorites.contentType, input.contentType), eq(helpFavorites.contentId, input.contentId))).limit(1))[0];
    if (existing) return existing;
    const [created] = await tx.insert(helpFavorites).values({ userId: input.userId, contentType: input.contentType, contentId: input.contentId.trim() }).$returningId();
    const favorite = (await tx.select().from(helpFavorites).where(eq(helpFavorites.id, created.id)).limit(1))[0];
    await tx.insert(auditLogs).values({ resourceType: "help_favorite", resourceId: created.id, action: "create", actorUserId: input.userId, beforeData: null, afterData: { contentType: input.contentType, contentId: input.contentId.trim() } });
    return favorite;
  });
}

export async function removeHelpFavorite(input: { userId: number; contentType: "manual" | "faq"; contentId: string }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const existing = (await tx.select().from(helpFavorites).where(and(eq(helpFavorites.userId, input.userId), eq(helpFavorites.contentType, input.contentType), eq(helpFavorites.contentId, input.contentId))).limit(1))[0];
    if (!existing) return;
    await tx.delete(helpFavorites).where(eq(helpFavorites.id, existing.id));
    await tx.insert(auditLogs).values({ resourceType: "help_favorite", resourceId: existing.id, action: "delete", actorUserId: input.userId, beforeData: { contentType: existing.contentType, contentId: existing.contentId }, afterData: null });
  });
}

export async function listOwnFaqSuggestions(userId: number) {
  const db = await requireDb();
  return db.select().from(faqSuggestions).where(eq(faqSuggestions.userId, userId)).orderBy(desc(faqSuggestions.createdAt));
}

export async function createFaqSuggestion(input: { userId: number; question: string; detail?: string | null }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const values = { userId: input.userId, question: input.question.trim(), detail: input.detail?.trim() || null, status: "pendente" as const };
    const [created] = await tx.insert(faqSuggestions).values(values).$returningId();
    const suggestion = (await tx.select().from(faqSuggestions).where(eq(faqSuggestions.id, created.id)).limit(1))[0];
    await tx.insert(auditLogs).values({ resourceType: "faq_suggestion", resourceId: created.id, action: "create", actorUserId: input.userId, beforeData: null, afterData: { question: values.question, hasDetail: Boolean(values.detail), status: values.status } });
    return suggestion;
  });
}

export async function recordAlrtIncomingEvent(input: { envelope: { eventId: string; idempotencyKey: string; correlationId: string; source: { environment: string }; eventType: string; schemaVersion: string; data: { alert: { category: string; priority: "baixa" | "media" | "alta" | "critica"; description: string; address: string; latitude: number; longitude: number; reportedAt: string } } }; payloadDigest: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const byEvent = (await tx.select().from(alrtIncomingEvents).where(eq(alrtIncomingEvents.eventId, input.envelope.eventId)).limit(1))[0];
    const existing = byEvent ?? (await tx.select().from(alrtIncomingEvents).where(eq(alrtIncomingEvents.idempotencyKey, input.envelope.idempotencyKey)).limit(1))[0];
    if (existing) return { event: existing, duplicate: true };
    const alert = input.envelope.data.alert;
    const [created] = await tx.insert(alrtIncomingEvents).values({ eventId: input.envelope.eventId, idempotencyKey: input.envelope.idempotencyKey, correlationId: input.envelope.correlationId, sourceEnvironment: input.envelope.source.environment, eventType: input.envelope.eventType, schemaVersion: input.envelope.schemaVersion, category: alert.category, priority: alert.priority, description: alert.description, address: alert.address, latitude: String(alert.latitude), longitude: String(alert.longitude), reportedAt: new Date(alert.reportedAt), payloadDigest: input.payloadDigest, status: "recebido" }).$returningId();
    const event = (await tx.select().from(alrtIncomingEvents).where(eq(alrtIncomingEvents.id, created.id)).limit(1))[0];
    await tx.insert(auditLogs).values({ resourceType: "alrt_incoming_event", resourceId: created.id, action: "received", actorUserId: null, beforeData: null, afterData: { eventId: input.envelope.eventId, correlationId: input.envelope.correlationId, eventType: input.envelope.eventType, category: alert.category, priority: alert.priority, status: "recebido", payloadDigest: input.payloadDigest } });
    return { event, duplicate: false };
  });
}

type ExternalReviewSource = { id: number; correlationId: string; eventType: string; sourceEnvironment: string; category: string; priority: IncidentPriority; description: string; address: string; latitude: string | number; longitude: string | number; receivedAt?: Date };

function workflowPathHasNode(definition: WorkflowDefinition, sourceId: string, targetId: string) {
  const targetsBySource = new Map<string, string[]>();
  definition.edges.forEach(edge => targetsBySource.set(edge.source, [...(targetsBySource.get(edge.source) ?? []), edge.target]));
  const visited = new Set<string>();
  const queue = [sourceId];
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    if (current === targetId) return true;
    visited.add(current);
    (targetsBySource.get(current) ?? []).forEach(next => queue.push(next));
  }
  return false;
}

function resolveReviewValue(value: unknown, fallback: string, event: ExternalReviewSource) {
  const configured = typeof value === "string" ? value.trim() : "";
  const tokens: Record<string, string> = { "{{alert.category}}": event.category, "{{alert.priority}}": event.priority, "{{alert.description}}": event.description, "{{alert.address}}": event.address, "{{alert.latitude}}": String(event.latitude), "{{alert.longitude}}": String(event.longitude), "{{correlationId}}": event.correlationId };
  return configured && tokens[configured] !== undefined ? tokens[configured] : configured || fallback;
}

export function isExternalEventEligibleForReview(eventReceivedAt: Date | undefined, workflowPublishedAt: Date | null) {
  return !eventReceivedAt || !workflowPublishedAt || eventReceivedAt >= workflowPublishedAt;
}

export function resolveExternalReviewWorkflow(definitionValue: unknown, source: { system: "despacho_alrt"; eventType: string; environment: string }) {
  const definition = normalizeWorkflowDefinition(definitionValue);
  const trigger = definition.nodes.find(node => node.type === "trigger.external_data" && node.configuration.sourceApplication === source.system && node.configuration.eventType === source.eventType && node.configuration.environment === source.environment);
  if (!trigger) return null;
  const occurrence = definition.nodes.find(node => node.type === "occurrence.create" && node.configuration.creationMode === "revisao_obrigatoria" && workflowPathHasNode(definition, trigger.id, node.id));
  return occurrence ? { trigger, occurrence } : null;
}

export async function createExternalIncidentReviewFromEvent(event: ExternalReviewSource) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const existing = (await tx.select().from(externalIncidentReviews).where(eq(externalIncidentReviews.incomingEventId, event.id)).limit(1))[0];
    if (existing) return { review: existing, duplicate: true };
    const candidates = await tx.select({ workflow: workflows, version: workflowVersions }).from(workflows).innerJoin(workflowVersions, and(eq(workflowVersions.workflowId, workflows.id), eq(workflowVersions.version, workflows.currentVersion))).where(and(eq(workflows.active, true), eq(workflows.status, "publicado")));
    const match = candidates.map(candidate => ({ ...candidate, configuration: resolveExternalReviewWorkflow(candidate.version.definition, { system: "despacho_alrt", eventType: event.eventType, environment: event.sourceEnvironment }) })).find(candidate => candidate.configuration);
    if (!match?.configuration) return { review: null, duplicate: false };
    if (!isExternalEventEligibleForReview(event.receivedAt, match.workflow.publishedAt)) return { review: null, duplicate: false };
    const configuration = match.configuration.occurrence.configuration;
    const mappedPriority = resolveReviewValue(configuration.priority, event.priority, event);
    const priority: IncidentPriority = ["baixa", "media", "alta", "critica"].includes(mappedPriority) ? mappedPriority as IncidentPriority : event.priority;
    const [created] = await tx.insert(externalIncidentReviews).values({ incomingEventId: event.id, workflowId: match.workflow.id, workflowVersionId: match.version.id, correlationId: event.correlationId, category: resolveReviewValue(configuration.category, event.category, event), priority, origin: "integracao", requesterName: resolveReviewValue(configuration.requesterName, "Despacho ALRT", event), requesterContact: resolveReviewValue(configuration.requesterContact, "", event) || null, description: resolveReviewValue(configuration.description, event.description, event), address: resolveReviewValue(configuration.address, event.address, event), latitude: resolveReviewValue(configuration.latitude, String(event.latitude), event), longitude: resolveReviewValue(configuration.longitude, String(event.longitude), event) }).$returningId();
    const review = (await tx.select().from(externalIncidentReviews).where(eq(externalIncidentReviews.id, created.id)).limit(1))[0];
    await tx.insert(integrationLogs).values({ workflowId: match.workflow.id, level: "sucesso", source: "workflow.external.review", message: "Evento externo convertido em prévia para revisão humana.", requestData: { incomingEventId: event.id, correlationId: event.correlationId, workflowVersion: match.version.version }, responseData: { reviewId: review.id, automaticEffects: false, occurrenceCreated: false } });
    await tx.insert(auditLogs).values({ resourceType: "external_incident_review", resourceId: review.id, action: "created", actorUserId: null, beforeData: null, afterData: { incomingEventId: event.id, workflowId: match.workflow.id, workflowVersionId: match.version.id, correlationId: event.correlationId, status: "pendente", automaticEffects: false } });
    return { review, duplicate: false };
  });
}

export async function reconcileExternalIncidentReviews() {
  const db = await requireDb();
  const pendingEvents = await db.select().from(alrtIncomingEvents).leftJoin(externalIncidentReviews, eq(externalIncidentReviews.incomingEventId, alrtIncomingEvents.id)).where(and(eq(alrtIncomingEvents.status, "recebido"), isNull(externalIncidentReviews.id))).orderBy(desc(alrtIncomingEvents.receivedAt)).limit(100);
  let created = 0;
  for (const { alrt_incoming_events: event } of pendingEvents) {
    const result = await createExternalIncidentReviewFromEvent(event);
    if (result.review && !result.duplicate) created += 1;
  }
  return { scanned: pendingEvents.length, created };
}

export async function listExternalIncidentReviews() {
  const db = await requireDb();
  await reconcileExternalIncidentReviews();
  return db.select({ review: externalIncidentReviews, workflowName: workflows.name }).from(externalIncidentReviews).innerJoin(workflows, eq(externalIncidentReviews.workflowId, workflows.id)).orderBy(desc(externalIncidentReviews.createdAt)).limit(50);
}

export async function confirmExternalIncidentReview(input: { reviewId: number; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const review = (await tx.select().from(externalIncidentReviews).where(eq(externalIncidentReviews.id, input.reviewId)).limit(1))[0];
    if (!review) throw new Error("Prévia externa não encontrada.");
    if (review.status !== "pendente") throw new Error("Esta prévia já foi revisada.");
    const [created] = await tx.insert(incidents).values({ code: createIncidentCode(), category: review.category, priority: review.priority, origin: review.origin, requesterName: review.requesterName, requesterContact: review.requesterContact, description: review.description, address: review.address, latitude: review.latitude, longitude: review.longitude, createdByUserId: input.actorUserId }).$returningId();
    const incident = (await tx.select().from(incidents).where(eq(incidents.id, created.id)).limit(1))[0];
    if (!incident) throw new Error("Falha ao criar a ocorrência revisada.");
    const now = new Date();
    await tx.insert(incidentEvents).values({ incidentId: incident.id, actorUserId: input.actorUserId, eventType: "occurrence_created", nextStatus: incident.status, message: "Ocorrência criada após revisão de evento externo.", metadata: { origin: incident.origin, priority: incident.priority, externalReviewId: review.id, correlationId: review.correlationId } });
    await tx.update(externalIncidentReviews).set({ status: "confirmada", reviewedByUserId: input.actorUserId, reviewedAt: now, createdIncidentId: incident.id }).where(eq(externalIncidentReviews.id, review.id));
    await tx.update(alrtIncomingEvents).set({ status: "processado", createdIncidentId: incident.id, processedAt: now }).where(eq(alrtIncomingEvents.id, review.incomingEventId));
    await tx.insert(auditLogs).values([{ resourceType: "incident", resourceId: incident.id, action: "create_from_external_review", actorUserId: input.actorUserId, beforeData: null, afterData: { ...snapshotIncident(incident), externalReviewId: review.id, correlationId: review.correlationId } }, { resourceType: "external_incident_review", resourceId: review.id, action: "confirmed", actorUserId: input.actorUserId, beforeData: { status: "pendente" }, afterData: { status: "confirmada", incidentId: incident.id, automaticEffects: false } }]);
    return { reviewId: review.id, incident };
  });
}

export async function recordAlrtIngressTestAttempt(input: { correlationId: string; httpStatus: number; result: "received" | "duplicate" | "rejected"; errorCode?: string | null; eventId?: string | null; eventType?: string | null; sourceEnvironment?: string | null }) {
  const db = await requireDb();
  const accepted = input.httpStatus < 400;
  await db.insert(integrationLogs).values({
    level: accepted ? "sucesso" : "erro",
    source: "alrt.ingress.teste",
    message: accepted ? input.result === "duplicate" ? "Teste de recepção ALRT identificado como duplicado." : "Teste de recepção ALRT recebido e persistido na fila de homologação." : `Teste de recepção ALRT rejeitado: ${input.errorCode ?? "erro de validação"}.`,
    endpoint: "/api/integrations/alrt/events",
    requestData: { source: "despacho-alrt", correlationId: input.correlationId, eventId: input.eventId ?? null, eventType: input.eventType ?? null, sourceEnvironment: input.sourceEnvironment ?? null },
    responseData: { result: input.result, automaticEffects: false, occurrenceCreated: false },
    httpStatus: input.httpStatus,
    durationMs: null,
    retryAttempt: 0,
    errorCode: input.errorCode ?? null,
  });
}

const ALRT_RATE_RESERVATION_SOURCE = "alrt.ingress.rate";

/**
 * Shared fixed-window limiter backed by MySQL. GET_LOCK serializes reservations
 * across application replicas without adding another infrastructure service.
 */
export async function consumeAlrtDistributedRateLimit(_key: string, limit: number, now = Date.now()) {
  const db = await requireDb();
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 60;
  const windowStartMs = Math.floor(now / 60_000) * 60_000;
  const windowStart = new Date(windowStartMs);
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + 60_000 - now) / 1000));
  const lockName = "axe:alrt:ingress:rate";
  const lockResult = await db.execute(sql`SELECT GET_LOCK(${lockName}, 2) AS acquired`);
  const lockRows = lockResult[0] as unknown as Array<{ acquired?: number | string }>;
  if (Number(lockRows?.[0]?.acquired) !== 1) throw new Error("Não foi possível reservar o limitador ALRT.");
  try {
    const current = await db.select({ total: count() }).from(integrationLogs).where(and(eq(integrationLogs.source, ALRT_RATE_RESERVATION_SOURCE), gte(integrationLogs.createdAt, windowStart)));
    if (Number(current[0]?.total ?? 0) >= safeLimit) return { allowed: false, retryAfterSeconds };
    await db.insert(integrationLogs).values({
      level: "info",
      source: ALRT_RATE_RESERVATION_SOURCE,
      message: "Reserva de capacidade do receptor ALRT.",
      endpoint: "/api/integrations/alrt/events",
      requestData: { windowStart: windowStart.toISOString() },
      responseData: { reserved: true },
      retryAttempt: 0,
    });
    // Retain only a small diagnostic horizon for internal reservation rows.
    await db.delete(integrationLogs).where(and(eq(integrationLogs.source, ALRT_RATE_RESERVATION_SOURCE), lt(integrationLogs.createdAt, new Date(now - 10 * 60_000))));
    return { allowed: true, retryAfterSeconds: 0 };
  } finally {
    await db.execute(sql`SELECT RELEASE_LOCK(${lockName})`).catch(() => undefined);
  }
}

export async function listAlrtIngressTestLog(limit = 25) {
  const db = await requireDb();
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return db.select({ id: integrationLogs.id, level: integrationLogs.level, source: integrationLogs.source, message: integrationLogs.message, requestData: integrationLogs.requestData, responseData: integrationLogs.responseData, httpStatus: integrationLogs.httpStatus, errorCode: integrationLogs.errorCode, createdAt: integrationLogs.createdAt }).from(integrationLogs).where(eq(integrationLogs.source, "alrt.ingress.teste")).orderBy(desc(integrationLogs.createdAt)).limit(safeLimit);
}

export async function auditOperationalReportExport(input: { actorUserId: number; format: "csv" | "pdf"; report: Awaited<ReturnType<typeof getOperationalReport>> }) {
  const db = await requireDb();
  await db.insert(auditLogs).values({ resourceType: "operational_report", resourceId: 0, action: "export", actorUserId: input.actorUserId, beforeData: null, afterData: { format: input.format, filters: { startDate: input.report.filters.startDate?.toISOString() ?? null, endDate: input.report.filters.endDate?.toISOString() ?? null, teamId: input.report.filters.teamId }, metrics: input.report.metrics, records: input.report.records.length } });
}

export async function getIncidentTimeline(incidentId: number) {
  const db = await requireDb();
  return db.select({ event: incidentEvents, actorName: users.name, teamCode: teams.code }).from(incidentEvents).leftJoin(users, eq(incidentEvents.actorUserId, users.id)).leftJoin(teams, eq(incidentEvents.teamId, teams.id)).where(eq(incidentEvents.incidentId, incidentId)).orderBy(desc(incidentEvents.createdAt));
}

export async function getIncidentAudit(incidentId: number) {
  const db = await requireDb();
  return db.select({ audit: auditLogs, actorName: users.name }).from(auditLogs).leftJoin(users, eq(auditLogs.actorUserId, users.id)).where(and(eq(auditLogs.resourceType, "incident"), eq(auditLogs.resourceId, incidentId))).orderBy(desc(auditLogs.createdAt));
}

export async function listUsersForAdministration() {
  const db = await requireDb();
  return db.select({ user: users, teamCode: teams.code, teamName: teams.name }).from(users).leftJoin(teams, eq(users.teamId, teams.id));
}

export async function updateOperationalUser(input: { userId: number; operationalRole: OperationalRole; teamId?: number | null; active?: boolean; actorUserId: number }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const before = (await tx.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!before) throw new Error("Usuário não encontrado.");
    const resolvedTeamId = input.teamId !== undefined ? input.teamId : before.teamId;
    if (requiresTeamForOperationalRole(input.operationalRole) && !resolvedTeamId) throw new Error("Agente de Campo precisa estar vinculado a uma equipe antes de salvar o perfil.");
    const patch: Partial<typeof users.$inferInsert> = { operationalRole: input.operationalRole, role: input.operationalRole === "administrador" ? "admin" : "user" };
    if (input.teamId !== undefined) patch.teamId = input.teamId;
    if (input.active !== undefined) patch.active = input.active;
    await tx.update(users).set(patch).where(eq(users.id, input.userId));
    if (input.operationalRole === "agente") {
      const agentRole = (await tx.select().from(accessRoles).where(and(eq(accessRoles.code, "agente_campo"), eq(accessRoles.active, true))).limit(1))[0];
      if (!agentRole) throw new Error("O perfil dinâmico Agente de Campo não está disponível ou está inativo.");
      const activeAssignments = await tx.select({ assignment: userRoleAssignments, roleCode: accessRoles.code }).from(userRoleAssignments).innerJoin(accessRoles, eq(accessRoles.id, userRoleAssignments.roleId)).where(and(eq(userRoleAssignments.userId, input.userId), eq(userRoleAssignments.active, true)));
      const agentAssignment = activeAssignments.find(entry => entry.roleCode === "agente_campo");
      const replacedAssignments = activeAssignments.filter(entry => entry.assignment.id !== agentAssignment?.assignment.id);
      for (const entry of replacedAssignments) await tx.update(userRoleAssignments).set({ active: false, activeUserId: null }).where(eq(userRoleAssignments.id, entry.assignment.id));
      if (agentAssignment) await tx.update(userRoleAssignments).set({ active: true, activeUserId: input.userId, teamId: resolvedTeamId, organizationId: null, organizationalUnitId: null }).where(eq(userRoleAssignments.id, agentAssignment.assignment.id));
      else await tx.insert(userRoleAssignments).values({ userId: input.userId, roleId: agentRole.id, activeUserId: input.userId, teamId: resolvedTeamId, organizationId: null, organizationalUnitId: null, assignedByUserId: input.actorUserId });
    }
    const after = (await tx.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!after) throw new Error("Falha ao atualizar usuário.");
    await tx.insert(auditLogs).values({ resourceType: "user", resourceId: input.userId, action: "operational_profile_updated", actorUserId: input.actorUserId, beforeData: { operationalRole: before.operationalRole, teamId: before.teamId, active: before.active }, afterData: { operationalRole: after.operationalRole, teamId: after.teamId, active: after.active, dynamicProfile: input.operationalRole === "agente" ? "agente_campo" : null } });
  });
}

export function resolveAgentOperationalReconciliation(user: Pick<User, "operationalRole" | "role" | "teamId">, agentProfileTeamId: number | null) {
  const teamId = user.teamId ?? agentProfileTeamId;
  if (user.operationalRole === "agente" && user.role === "user" && user.teamId === teamId) return null;
  return { operationalRole: "agente" as const, role: "user" as const, teamId };
}

export async function reconcileOperationalRoleWithAssignments(user: User): Promise<User> {
  const db = await getDb();
  if (!db) return user;
  const activeAssignments = await db.select({ id: userRoleAssignments.id, teamId: userRoleAssignments.teamId, roleCode: accessRoles.code }).from(userRoleAssignments).innerJoin(accessRoles, eq(accessRoles.id, userRoleAssignments.roleId)).where(and(eq(userRoleAssignments.userId, user.id), eq(userRoleAssignments.active, true), eq(accessRoles.active, true)));
  const agentAssignments = activeAssignments.filter(assignment => assignment.roleCode === "agente_campo");
  const agentAssignment = agentAssignments.find(assignment => assignment.teamId === user.teamId) ?? agentAssignments[0];
  if (!agentAssignment) return user;
  const reconciliation = resolveAgentOperationalReconciliation(user, agentAssignment.teamId);
  const target = reconciliation ?? { operationalRole: "agente" as const, role: "user" as const, teamId: user.teamId ?? agentAssignment.teamId };
  const duplicateAssignments = activeAssignments.filter(assignment => assignment.id !== agentAssignment.id);
  const requiresProfileTeamSync = agentAssignment.teamId !== target.teamId;
  if (!reconciliation && !duplicateAssignments.length && !requiresProfileTeamSync) return user;
  await db.transaction(async tx => {
    await tx.update(users).set(target).where(eq(users.id, user.id));
    await tx.update(userRoleAssignments).set({ active: true, activeUserId: user.id, ...(requiresProfileTeamSync ? { teamId: target.teamId } : {}) }).where(eq(userRoleAssignments.id, agentAssignment.id));
    for (const duplicate of duplicateAssignments) await tx.update(userRoleAssignments).set({ active: false, activeUserId: null }).where(eq(userRoleAssignments.id, duplicate.id));
    await tx.insert(auditLogs).values({ resourceType: "user", resourceId: user.id, action: "operational_profile_reconciled", actorUserId: user.id, beforeData: { operationalRole: user.operationalRole, teamId: user.teamId, role: user.role }, afterData: { ...target, sourceProfile: "agente_campo", deactivatedDuplicateAssignments: duplicateAssignments.length } });
  });
  return (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0] ?? user;
}

export async function createTeam(input: { code: string; name: string; agency: string; organizationId?: number | null; organizationalUnitId?: number | null; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [created] = await tx.insert(teams).values({ code: input.code, name: input.name, agency: input.agency, organizationId: input.organizationId ?? null, organizationalUnitId: input.organizationalUnitId ?? null }).$returningId();
    await tx.insert(auditLogs).values({
      resourceType: "team",
      resourceId: created.id,
      action: "create",
      actorUserId: input.actorUserId,
      beforeData: null,
      afterData: { code: input.code, name: input.name, agency: input.agency, organizationId: input.organizationId ?? null, organizationalUnitId: input.organizationalUnitId ?? null },
    });
    return created;
  });
}

export async function listVehicles() {
  const db = await requireDb();
  return db.select({ vehicle: vehicles, teamCode: teams.code, teamName: teams.name }).from(vehicles).leftJoin(teams, eq(vehicles.teamId, teams.id)).orderBy(vehicles.prefix);
}

export async function createVehicle(input: { prefix: string; licensePlate: string; model?: string; type: string; teamId?: number; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [created] = await tx.insert(vehicles).values({
      prefix: input.prefix,
      licensePlate: input.licensePlate,
      model: input.model ?? null,
      type: input.type,
      teamId: input.teamId ?? null,
    }).$returningId();
    await tx.insert(auditLogs).values({
      resourceType: "vehicle",
      resourceId: created.id,
      action: "create",
      actorUserId: input.actorUserId,
      beforeData: null,
      afterData: { prefix: input.prefix, licensePlate: input.licensePlate, model: input.model ?? null, type: input.type, teamId: input.teamId ?? null },
    });
    return created;
  });
}

export async function updateVehicleStatus(input: { vehicleId: number; status: typeof vehicles.$inferInsert.status; actorUserId: number }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const before = (await tx.select().from(vehicles).where(eq(vehicles.id, input.vehicleId)).limit(1))[0];
    if (!before) throw new Error("Viatura não encontrada.");
    await tx.update(vehicles).set({ status: input.status }).where(eq(vehicles.id, input.vehicleId));
    await tx.insert(auditLogs).values({
      resourceType: "vehicle",
      resourceId: input.vehicleId,
      action: "status_updated",
      actorUserId: input.actorUserId,
      beforeData: { status: before.status },
      afterData: { status: input.status },
    });
  });
}

export async function listAccessRoles() {
  const db = await requireDb();
  const [roles, assignmentCounts, permissionRows] = await Promise.all([
    db.select().from(accessRoles).orderBy(accessRoles.name),
    db.select({ roleId: userRoleAssignments.roleId, total: count(userRoleAssignments.id) }).from(userRoleAssignments).where(eq(userRoleAssignments.active, true)).groupBy(userRoleAssignments.roleId),
    db.select({ roleId: rolePermissions.roleId, permissionId: rolePermissions.permissionId }).from(rolePermissions),
  ]);
  const countByRole = new Map(assignmentCounts.map(row => [row.roleId, Number(row.total)]));
  const permissionsByRole = new Map<number, number[]>();
  for (const row of permissionRows) permissionsByRole.set(row.roleId, [...(permissionsByRole.get(row.roleId) ?? []), row.permissionId]);
  return roles.map(role => ({ role, assignedUsers: countByRole.get(role.id) ?? 0, permissionIds: permissionsByRole.get(role.id) ?? [] }));
}

export async function listAccessPermissions() {
  const db = await requireDb();
  return db.select().from(accessPermissions).where(eq(accessPermissions.active, true)).orderBy(accessPermissions.resource, accessPermissions.action);
}

export async function createAccessPermission(input: { code: string; resource: string; action: string; description?: string; actorUserId: number }) {
  const db = await requireDb();
  const code = input.code.trim().toLowerCase();
  const resource = input.resource.trim().toLowerCase();
  const action = input.action.trim().toLowerCase();
  if (code !== `${resource}.${action}`) throw new Error("O código da permissão deve corresponder a recurso.ação.");
  return db.transaction(async tx => {
    const duplicate = (await tx.select({ id: accessPermissions.id }).from(accessPermissions).where(eq(accessPermissions.code, code)).limit(1))[0];
    if (duplicate) throw new Error("Já existe uma permissão local com este código.");
    const [created] = await tx.insert(accessPermissions).values({ code, resource, action, description: input.description?.trim() || null }).$returningId();
    await tx.insert(auditLogs).values({ resourceType: "access_permission", resourceId: created.id, action: "create", actorUserId: input.actorUserId, beforeData: null, afterData: { code, resource, action, description: input.description?.trim() || null } });
    return created;
  });
}

export async function listOrganizationsAndUnits() {
  const db = await requireDb();
  const [organizationRows, unitRows] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.active, true)).orderBy(organizations.name),
    db.select().from(organizationalUnits).where(eq(organizationalUnits.active, true)).orderBy(organizationalUnits.name),
  ]);
  return { organizations: organizationRows, units: unitRows };
}

type OperationalMapSettings = {
  centerLatitude: number;
  centerLongitude: number;
  defaultZoom: number;
  mapType: "roadmap" | "satellite" | "terrain" | "hybrid";
  trafficEnabled: boolean;
  autoFitEnabled: boolean;
  fallbackMode: "automatic" | "openstreetmap" | "google_only";
};

const defaultMapSettings: OperationalMapSettings = {
  centerLatitude: -27.0976,
  centerLongitude: -48.9104,
  defaultZoom: 13,
  mapType: "roadmap",
  trafficEnabled: false,
  autoFitEnabled: true,
  fallbackMode: "automatic",
};

function formatMapSettings(row?: typeof generalSettings.$inferSelect): OperationalMapSettings {
  if (!row) return defaultMapSettings;
  return {
    centerLatitude: Number(row.mapCenterLatitude),
    centerLongitude: Number(row.mapCenterLongitude),
    defaultZoom: row.mapDefaultZoom,
    mapType: row.mapType as OperationalMapSettings["mapType"],
    trafficEnabled: row.mapTrafficEnabled,
    autoFitEnabled: row.mapAutoFitEnabled,
    fallbackMode: row.mapFallbackMode as OperationalMapSettings["fallbackMode"],
  };
}

export async function getOperationalMapSettings() {
  const db = await requireDb();
  const row = (await db.select().from(generalSettings).where(eq(generalSettings.id, 1)).limit(1))[0];
  return formatMapSettings(row);
}

export async function listFutureGeneralSettingEntries() {
  const db = await requireDb();
  return db.select().from(generalSettingEntries).where(eq(generalSettingEntries.active, true)).orderBy(generalSettingEntries.section, generalSettingEntries.settingKey);
}

export async function updateGeneralMapSettings(input: OperationalMapSettings & { actorUserId: number }) {
  const db = await requireDb();
  const settings: OperationalMapSettings = {
    centerLatitude: input.centerLatitude,
    centerLongitude: input.centerLongitude,
    defaultZoom: input.defaultZoom,
    mapType: input.mapType,
    trafficEnabled: input.trafficEnabled,
    autoFitEnabled: input.autoFitEnabled,
    fallbackMode: input.fallbackMode,
  };
  return db.transaction(async tx => {
    const before = (await tx.select().from(generalSettings).where(eq(generalSettings.id, 1)).limit(1))[0];
    const values = { mapCenterLatitude: String(settings.centerLatitude), mapCenterLongitude: String(settings.centerLongitude), mapDefaultZoom: settings.defaultZoom, mapType: settings.mapType, mapTrafficEnabled: settings.trafficEnabled, mapAutoFitEnabled: settings.autoFitEnabled, mapFallbackMode: settings.fallbackMode };
    if (before) await tx.update(generalSettings).set(values).where(eq(generalSettings.id, 1));
    else await tx.insert(generalSettings).values({ id: 1, ...values });
    await tx.insert(auditLogs).values({ resourceType: "general_settings", resourceId: 1, action: "map_configuration_updated", actorUserId: input.actorUserId, beforeData: before ? formatMapSettings(before) : null, afterData: settings });
    return settings;
  });
}

export function createManualUserOpenId() {
  return `manual:${nanoid(21)}`;
}

export function shouldLinkPreprovisionedUser(input: { hasExistingOpenId: boolean; hasCorporateEmail: boolean; hasPreprovisionedEmail: boolean }) {
  return !input.hasExistingOpenId && input.hasCorporateEmail && input.hasPreprovisionedEmail;
}

export function requiresTeamForOperationalRole(role: OperationalRole) {
  return role === "agente";
}

export async function createOrganization(input: { code: string; name: string; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [created] = await tx.insert(organizations).values({ code: input.code, name: input.name }).$returningId();
    await tx.insert(auditLogs).values({ resourceType: "organization", resourceId: created.id, action: "create", actorUserId: input.actorUserId, beforeData: null, afterData: { code: input.code, name: input.name } });
    return created;
  });
}

export async function createOrganizationalUnit(input: { organizationId: number; parentId?: number | null; type: typeof organizationalUnits.$inferInsert.type; code: string; name: string; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [created] = await tx.insert(organizationalUnits).values({ organizationId: input.organizationId, parentId: input.parentId ?? null, type: input.type, code: input.code, name: input.name }).$returningId();
    await tx.insert(auditLogs).values({ resourceType: "organizational_unit", resourceId: created.id, action: "create", actorUserId: input.actorUserId, beforeData: null, afterData: { organizationId: input.organizationId, parentId: input.parentId ?? null, type: input.type, code: input.code, name: input.name } });
    return created;
  });
}

type OrganizationalUnitHierarchy = Pick<typeof organizationalUnits.$inferSelect, "id" | "organizationId" | "parentId">;

export function getOrganizationalUnitParentIssue(input: { unitId: number; organizationId: number; parentId?: number | null; units: OrganizationalUnitHierarchy[] }) {
  if (input.parentId === null || input.parentId === undefined) return null;
  if (input.parentId === input.unitId) return "Uma unidade não pode ser pai de si mesma.";
  const unitsById = new Map(input.units.map(unit => [unit.id, unit]));
  const visited = new Set<number>();
  let current = unitsById.get(input.parentId);
  while (current) {
    if (current.organizationId !== input.organizationId) return "A unidade-pai deve pertencer à mesma organização.";
    if (current.id === input.unitId) return "A unidade-pai não pode ser uma unidade filha desta hierarquia.";
    if (visited.has(current.id)) return "A hierarquia atual contém um ciclo e precisa ser corrigida antes da edição.";
    visited.add(current.id);
    current = current.parentId ? unitsById.get(current.parentId) : undefined;
  }
  return null;
}

export async function updateOrganization(input: { organizationId: number; code: string; name: string; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(organizations).where(eq(organizations.id, input.organizationId)).limit(1))[0];
    if (!before) throw new Error("Organização não encontrada.");
    const duplicate = (await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.code, input.code)).limit(1))[0];
    if (duplicate && duplicate.id !== input.organizationId) throw new Error("Já existe uma organização com este código.");
    await tx.update(organizations).set({ code: input.code, name: input.name }).where(eq(organizations.id, input.organizationId));
    await tx.insert(auditLogs).values({ resourceType: "organization", resourceId: input.organizationId, action: "update", actorUserId: input.actorUserId, beforeData: { code: before.code, name: before.name }, afterData: { code: input.code, name: input.name } });
    return { id: input.organizationId };
  });
}

export async function updateOrganizationalUnit(input: { unitId: number; parentId?: number | null; type: typeof organizationalUnits.$inferInsert.type; code: string; name: string; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(organizationalUnits).where(eq(organizationalUnits.id, input.unitId)).limit(1))[0];
    if (!before) throw new Error("Unidade organizacional não encontrada.");
    const organizationUnits = await tx.select({ id: organizationalUnits.id, organizationId: organizationalUnits.organizationId, parentId: organizationalUnits.parentId }).from(organizationalUnits).where(eq(organizationalUnits.organizationId, before.organizationId));
    const parentIssue = getOrganizationalUnitParentIssue({ unitId: before.id, organizationId: before.organizationId, parentId: input.parentId, units: organizationUnits });
    if (parentIssue) throw new Error(parentIssue);
    const duplicate = (await tx.select({ id: organizationalUnits.id }).from(organizationalUnits).where(eq(organizationalUnits.code, input.code)).limit(1))[0];
    if (duplicate && duplicate.id !== input.unitId) throw new Error("Já existe uma unidade organizacional com este código.");
    await tx.update(organizationalUnits).set({ parentId: input.parentId ?? null, type: input.type, code: input.code, name: input.name }).where(eq(organizationalUnits.id, input.unitId));
    await tx.insert(auditLogs).values({ resourceType: "organizational_unit", resourceId: input.unitId, action: "update", actorUserId: input.actorUserId, beforeData: { parentId: before.parentId, type: before.type, code: before.code, name: before.name }, afterData: { parentId: input.parentId ?? null, type: input.type, code: input.code, name: input.name } });
    return { id: input.unitId };
  });
}

export async function listUsersWithAccess(input: { page: number; pageSize: number; search?: string; active?: boolean }) {
  const db = await requireDb();
  const filters = [];
  if (input.search?.trim()) filters.push(or(like(users.name, `%${input.search.trim()}%`), like(users.email, `%${input.search.trim()}%`), like(users.openId, `%${input.search.trim()}%`)));
  if (input.active !== undefined) filters.push(eq(users.active, input.active));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, totalRows] = await Promise.all([
    db.select({ user: users, profile: userProfiles, teamCode: teams.code, teamName: teams.name }).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).leftJoin(teams, eq(users.teamId, teams.id)).where(where).orderBy(desc(users.lastSignedIn)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(users).where(where),
  ]);
  const ids = rows.map(row => row.user.id);
  const assignments = ids.length ? await db.select({ assignment: userRoleAssignments, role: accessRoles }).from(userRoleAssignments).innerJoin(accessRoles, eq(userRoleAssignments.roleId, accessRoles.id)).where(and(inArray(userRoleAssignments.userId, ids), eq(userRoleAssignments.active, true))) : [];
  const assignmentsByUser = new Map<number, typeof assignments>();
  for (const assignment of assignments) assignmentsByUser.set(assignment.assignment.userId, [...(assignmentsByUser.get(assignment.assignment.userId) ?? []), assignment]);
  return { rows: await Promise.all(rows.map(async row => ({ ...row, profile: row.profile ? { ...row.profile, avatarUrl: row.profile.avatarStorageKey ? (await storageGet(row.profile.avatarStorageKey)).url : null } : null, assignments: assignmentsByUser.get(row.user.id) ?? [] }))), total: Number(totalRows[0]?.total ?? 0) };
}

export async function createManualUser(input: { displayName: string; email: string; username?: string | null; passwordHash?: string | null; employeeId?: string | null; institutionalId?: string | null; phone?: string | null; jobTitle?: string | null; operationalRole: OperationalRole; active: boolean; teamId?: number | null; roleId: number; organizationId?: number | null; organizationalUnitId?: number | null; roleTeamId?: number | null; actorUserId: number }) {
  const db = await requireDb();
  const email = input.email.trim().toLowerCase();
  if (requiresTeamForOperationalRole(input.operationalRole) && !input.teamId) throw new Error("Agentes de campo devem ser vinculados a uma equipe no pré-cadastro.");
  return db.transaction(async tx => {
    const duplicateEmail = (await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
    if (duplicateEmail) throw new Error("Já existe um usuário cadastrado com este e-mail.");
    if (input.username) {
      const duplicateUsername = (await tx.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1))[0];
      if (duplicateUsername) throw new Error("Este nome de usuário já está em uso.");
    }
    if (input.employeeId) {
      const duplicateEmployee = (await tx.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.employeeId, input.employeeId)).limit(1))[0];
      if (duplicateEmployee) throw new Error("A matrícula informada já está vinculada a outro usuário.");
    }
    const role = (await tx.select().from(accessRoles).where(eq(accessRoles.id, input.roleId)).limit(1))[0];
    if (!role || !role.active) throw new Error("Perfil não encontrado ou inativo.");
    if (!isRoleScopeAssignmentValid({ defaultScope: role.defaultScope, organizationId: input.organizationId, organizationalUnitId: input.organizationalUnitId, teamId: input.roleTeamId })) throw new Error("O escopo informado não atende ao nível exigido pelo perfil.");
    const openId = createManualUserOpenId();
    const [created] = await tx.insert(users).values({ openId, username: input.username ?? null, passwordHash: input.passwordHash ?? null, name: input.displayName, email, loginMethod: input.passwordHash ? "local_password" : "preprovisioned", role: input.operationalRole === "administrador" ? "admin" : "user", operationalRole: input.operationalRole, teamId: input.teamId ?? null, active: input.active }).$returningId();
    await tx.insert(userProfiles).values({ userId: created.id, displayName: input.displayName, employeeId: input.employeeId ?? null, institutionalId: input.institutionalId ?? null, phone: input.phone ?? null, jobTitle: input.jobTitle ?? null, authType: "preprovisioned" });
    const [assignment] = await tx.insert(userRoleAssignments).values({ userId: created.id, roleId: input.roleId, organizationId: input.organizationId ?? null, organizationalUnitId: input.organizationalUnitId ?? null, teamId: input.roleTeamId ?? null, activeUserId: created.id, assignedByUserId: input.actorUserId }).$returningId();
    await tx.insert(auditLogs).values([
      { resourceType: "user", resourceId: created.id, action: input.passwordHash ? "local_user_provisioned" : "manual_preprovision", actorUserId: input.actorUserId, beforeData: null, afterData: { displayName: input.displayName, email, username: input.username ?? null, employeeId: input.employeeId ?? null, institutionalId: input.institutionalId ?? null, operationalRole: input.operationalRole, active: input.active } },
      { resourceType: "user_role_assignment", resourceId: assignment.id, action: "create", actorUserId: input.actorUserId, beforeData: null, afterData: { userId: created.id, roleId: input.roleId, organizationId: input.organizationId ?? null, organizationalUnitId: input.organizationalUnitId ?? null, teamId: input.roleTeamId ?? null } },
    ]);
    return { id: created.id };
  });
}

export async function setUserLocalCredentials(input: { userId: number; username: string; passwordHash: string; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const user = (await tx.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!user) throw new Error("Usuário não encontrado.");
    const duplicate = (await tx.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1))[0];
    if (duplicate && duplicate.id !== user.id) throw new Error("Este nome de usuário já está em uso.");
    await tx.update(users).set({ username: input.username, passwordHash: input.passwordHash, loginMethod: "local_password", failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
    await tx.insert(auditLogs).values({ resourceType: "user", resourceId: user.id, action: "local_credentials_set", actorUserId: input.actorUserId, beforeData: { username: user.username }, afterData: { username: input.username } });
    return { id: user.id, username: input.username };
  });
}

export async function createAccessRole(input: { code: string; name: string; description?: string; defaultScope: typeof accessRoles.$inferInsert.defaultScope; permissionIds: number[]; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const duplicate = (await tx.select({ id: accessRoles.id }).from(accessRoles).where(eq(accessRoles.code, input.code)).limit(1))[0];
    if (duplicate) throw new Error("Já existe um perfil local com este código.");
    const [created] = await tx.insert(accessRoles).values({ code: input.code, name: input.name, description: input.description ?? null, defaultScope: input.defaultScope, isSystem: false }).$returningId();
    if (input.permissionIds.length) await tx.insert(rolePermissions).values(input.permissionIds.map(permissionId => ({ roleId: created.id, permissionId })));
    await tx.insert(auditLogs).values({ resourceType: "access_role", resourceId: created.id, action: "create", actorUserId: input.actorUserId, beforeData: null, afterData: { code: input.code, name: input.name, defaultScope: input.defaultScope, permissionIds: input.permissionIds } });
    return created;
  });
}

export async function updateAccessRole(input: { roleId: number; name?: string; description?: string | null; defaultScope?: typeof accessRoles.$inferInsert.defaultScope; permissionIds?: number[]; active?: boolean; actorUserId: number }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const before = (await tx.select().from(accessRoles).where(eq(accessRoles.id, input.roleId)).limit(1))[0];
    if (!before) throw new Error("Perfil não encontrado.");
    if (!canUpdateRoleDefinition({ isSystem: before.isSystem, permissionIdsProvided: input.permissionIds !== undefined, active: input.active })) throw new Error("Perfis padrão não permitem alteração de matriz ou ativação.");
    const patch: Partial<typeof accessRoles.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.defaultScope !== undefined) patch.defaultScope = input.defaultScope;
    if (input.active !== undefined) patch.active = input.active;
    if (Object.keys(patch).length) await tx.update(accessRoles).set(patch).where(eq(accessRoles.id, input.roleId));
    if (input.permissionIds) {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));
      if (input.permissionIds.length) await tx.insert(rolePermissions).values(input.permissionIds.map(permissionId => ({ roleId: input.roleId, permissionId })));
    }
    const after = (await tx.select().from(accessRoles).where(eq(accessRoles.id, input.roleId)).limit(1))[0];
    await tx.insert(auditLogs).values({ resourceType: "access_role", resourceId: input.roleId, action: "update", actorUserId: input.actorUserId, beforeData: { name: before.name, description: before.description, defaultScope: before.defaultScope, active: before.active }, afterData: { name: after?.name, description: after?.description, defaultScope: after?.defaultScope, active: after?.active, permissionIds: input.permissionIds } });
  });
}

export async function assignUserRole(input: { userId: number; roleId: number; organizationId?: number | null; organizationalUnitId?: number | null; teamId?: number | null; expiresAt?: Date | null; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const role = (await tx.select().from(accessRoles).where(eq(accessRoles.id, input.roleId)).limit(1))[0];
    if (!role || !role.active) throw new Error("Perfil não encontrado ou inativo.");
    if (!isRoleScopeAssignmentValid({ defaultScope: role.defaultScope, organizationId: input.organizationId, organizationalUnitId: input.organizationalUnitId, teamId: input.teamId })) throw new Error("O escopo informado não atende ao nível exigido pelo perfil.");
    const previous = await tx.select({ id: userRoleAssignments.id, roleId: userRoleAssignments.roleId }).from(userRoleAssignments).where(and(eq(userRoleAssignments.userId, input.userId), eq(userRoleAssignments.active, true)));
    if (previous.length) await tx.update(userRoleAssignments).set({ active: false, activeUserId: null }).where(and(eq(userRoleAssignments.userId, input.userId), eq(userRoleAssignments.active, true)));
    const [created] = await tx.insert(userRoleAssignments).values({ userId: input.userId, roleId: input.roleId, organizationId: input.organizationId ?? null, organizationalUnitId: input.organizationalUnitId ?? null, teamId: input.teamId ?? null, activeUserId: input.userId, expiresAt: input.expiresAt ?? null, assignedByUserId: input.actorUserId }).$returningId();
    await tx.insert(auditLogs).values({ resourceType: "user_role_assignment", resourceId: created.id, action: "profile_replaced", actorUserId: input.actorUserId, beforeData: { replacedAssignmentIds: previous.map(assignment => assignment.id), replacedRoleIds: previous.map(assignment => assignment.roleId) }, afterData: { userId: input.userId, roleId: input.roleId, organizationId: input.organizationId ?? null, organizationalUnitId: input.organizationalUnitId ?? null, teamId: input.teamId ?? null, expiresAt: input.expiresAt?.toISOString() ?? null, singleActiveProfile: true } });
    return created;
  });
}

export async function setUserRoleAssignmentActive(input: { assignmentId: number; active: boolean; actorUserId: number }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const before = (await tx.select().from(userRoleAssignments).where(eq(userRoleAssignments.id, input.assignmentId)).limit(1))[0];
    if (!before) throw new Error("Vínculo de perfil não encontrado.");
    const replaced = input.active ? await tx.select({ id: userRoleAssignments.id }).from(userRoleAssignments).where(and(eq(userRoleAssignments.userId, before.userId), eq(userRoleAssignments.active, true), ne(userRoleAssignments.id, input.assignmentId))) : [];
    if (replaced.length) await tx.update(userRoleAssignments).set({ active: false, activeUserId: null }).where(and(eq(userRoleAssignments.userId, before.userId), eq(userRoleAssignments.active, true), ne(userRoleAssignments.id, input.assignmentId)));
    await tx.update(userRoleAssignments).set({ active: input.active, activeUserId: input.active ? before.userId : null }).where(eq(userRoleAssignments.id, input.assignmentId));
    await tx.insert(auditLogs).values({ resourceType: "user_role_assignment", resourceId: input.assignmentId, action: input.active ? "activate_profile_exclusive" : "deactivate", actorUserId: input.actorUserId, beforeData: { active: before.active, replacedAssignmentIds: replaced.map(assignment => assignment.id) }, afterData: { active: input.active, singleActiveProfile: true } });
  });
}

export async function updateUserProfileAccess(input: { userId: number; active?: boolean; displayName?: string | null; employeeId?: string | null; institutionalId?: string | null; phone?: string | null; jobTitle?: string | null; mfaEnabled?: boolean; accessExpiresAt?: Date | null; actorUserId: number }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const beforeUser = (await tx.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!beforeUser) throw new Error("Usuário não encontrado.");
    const beforeProfile = (await tx.select().from(userProfiles).where(eq(userProfiles.userId, input.userId)).limit(1))[0];
    if (input.active !== undefined) await tx.update(users).set({ active: input.active }).where(eq(users.id, input.userId));
    const profilePatch = {
      userId: input.userId,
      displayName: input.displayName !== undefined ? input.displayName : beforeProfile?.displayName ?? null,
      employeeId: input.employeeId !== undefined ? input.employeeId : beforeProfile?.employeeId ?? null,
      institutionalId: input.institutionalId !== undefined ? input.institutionalId : beforeProfile?.institutionalId ?? null,
      phone: input.phone !== undefined ? input.phone : beforeProfile?.phone ?? null,
      jobTitle: input.jobTitle !== undefined ? input.jobTitle : beforeProfile?.jobTitle ?? null,
      mfaEnabled: input.mfaEnabled !== undefined ? input.mfaEnabled : beforeProfile?.mfaEnabled ?? false,
      accessExpiresAt: input.accessExpiresAt !== undefined ? input.accessExpiresAt : beforeProfile?.accessExpiresAt ?? null,
    };
    await tx.insert(userProfiles).values(profilePatch).onDuplicateKeyUpdate({ set: profilePatch });
    await tx.insert(auditLogs).values({ resourceType: "user", resourceId: input.userId, action: "access_profile_updated", actorUserId: input.actorUserId, beforeData: { active: beforeUser.active }, afterData: { active: input.active ?? beforeUser.active, displayName: profilePatch.displayName, employeeId: profilePatch.employeeId, institutionalId: profilePatch.institutionalId, phone: profilePatch.phone, jobTitle: profilePatch.jobTitle, mfaEnabled: profilePatch.mfaEnabled, accessExpiresAt: profilePatch.accessExpiresAt?.toISOString() ?? null } });
  });
}

export type WorkflowDefinition = {
  nodes: Array<{ id: string; type: string; label: string; position: { x: number; y: number }; configuration: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string }>;
  metadata: {
    mode: "simulacao";
    definitionVersion: 1;
    automation: {
      requestedMode: "simulacao" | "producao_protegida";
      activationRule: "manual" | "incident.created" | "incident.status_changed" | "integration.alrt_alert";
      targetConnection: string;
      activationStatus: "bloqueada";
      requiresApproval: true;
    };
  };
};

const defaultWorkflowAutomation = (): WorkflowDefinition["metadata"]["automation"] => ({ requestedMode: "simulacao", activationRule: "manual", targetConnection: "nenhuma", activationStatus: "bloqueada", requiresApproval: true });

export function createInitialSimulatedWorkflowDefinition(): WorkflowDefinition {
  return { nodes: [], edges: [], metadata: { mode: "simulacao", definitionVersion: 1, automation: defaultWorkflowAutomation() } };
}

export type WorkflowValidationReport = { valid: boolean; errors: string[]; warnings: string[] };

export function normalizeWorkflowDefinition(value: unknown): WorkflowDefinition {
  if (!value || typeof value !== "object") return createInitialSimulatedWorkflowDefinition();
  const candidate = value as { nodes?: unknown; edges?: unknown; metadata?: unknown };
  const nodes = Array.isArray(candidate.nodes) ? candidate.nodes.flatMap(node => {
    if (!node || typeof node !== "object") return [];
    const current = node as { id?: unknown; type?: unknown; label?: unknown; position?: unknown; configuration?: unknown };
    if (typeof current.id !== "string" || typeof current.type !== "string" || typeof current.label !== "string" || !current.position || typeof current.position !== "object") return [];
    const position = current.position as { x?: unknown; y?: unknown };
    if (typeof position.x !== "number" || typeof position.y !== "number") return [];
    return [{ id: current.id, type: current.type, label: current.label, position: { x: position.x, y: position.y }, configuration: current.configuration && typeof current.configuration === "object" && !Array.isArray(current.configuration) ? current.configuration as Record<string, unknown> : {} }];
  }) : [];
  const edges = Array.isArray(candidate.edges) ? candidate.edges.flatMap(edge => {
    if (!edge || typeof edge !== "object") return [];
    const current = edge as { id?: unknown; source?: unknown; target?: unknown };
    return typeof current.id === "string" && typeof current.source === "string" && typeof current.target === "string" ? [{ id: current.id, source: current.source, target: current.target }] : [];
  }) : [];
  const rawAutomation = candidate.metadata && typeof candidate.metadata === "object" && "automation" in candidate.metadata ? (candidate.metadata as { automation?: unknown }).automation : null;
  const automationCandidate = rawAutomation && typeof rawAutomation === "object" ? rawAutomation as Partial<WorkflowDefinition["metadata"]["automation"]> : {};
  const requestedMode = automationCandidate.requestedMode === "producao_protegida" ? "producao_protegida" : "simulacao";
  const activationRule = ["manual", "incident.created", "incident.status_changed", "integration.alrt_alert"].includes(String(automationCandidate.activationRule)) ? automationCandidate.activationRule as WorkflowDefinition["metadata"]["automation"]["activationRule"] : "manual";
  const targetConnection = typeof automationCandidate.targetConnection === "string" && automationCandidate.targetConnection.trim() ? automationCandidate.targetConnection.trim().slice(0, 100) : "nenhuma";
  return { nodes, edges, metadata: { mode: "simulacao", definitionVersion: 1, automation: { requestedMode, activationRule, targetConnection, activationStatus: "bloqueada", requiresApproval: true } } };
}

function configurationText(configuration: Record<string, unknown>, key: string) {
  const value = configuration[key];
  return typeof value === "string" ? value.trim() : "";
}

export function getWorkflowNodeConfigurationErrors(node: WorkflowDefinition["nodes"][number]) {
  const configuration = node.configuration;
  if (node.type === "trigger.manual") return configurationText(configuration, "inputLabel") ? [] : ["O gatilho manual precisa de um nome para a entrada de teste."];
  if (node.type === "trigger.external_data") {
    const sourceApplication = configurationText(configuration, "sourceApplication");
    const environment = configurationText(configuration, "environment");
    const errors = [];
    if (!sourceApplication) errors.push("A entrada externa precisa informar a aplicação de origem.");
    if (sourceApplication && !["despacho_alrt", "aplicacao_parceira"].includes(sourceApplication)) errors.push("A aplicação de origem da entrada externa é inválida.");
    if (!configurationText(configuration, "sourceConnection")) errors.push("A entrada externa precisa informar a conexão de referência.");
    if (!configurationText(configuration, "eventType")) errors.push("A entrada externa precisa informar o tipo de evento.");
    if (environment !== "homologacao") errors.push("A entrada externa só pode ser configurada para homologação nesta etapa.");
    return errors;
  }
  if (node.type === "condition.if") {
    const operator = configurationText(configuration, "operator");
    const errors = [];
    if (!configurationText(configuration, "field")) errors.push("A condição precisa informar o campo a avaliar.");
    if (!operator) errors.push("A condição precisa informar um operador.");
    if (!configurationText(configuration, "value")) errors.push("A condição precisa informar um valor de comparação.");
    if (operator && !["equals", "contains", "greater_than", "less_than"].includes(operator)) errors.push("O operador da condição é inválido.");
    return errors;
  }
  if (node.type === "data.transform") {
    const errors = [];
    if (!configurationText(configuration, "sourceField")) errors.push("A transformação precisa informar o campo de origem.");
    if (!configurationText(configuration, "targetField")) errors.push("A transformação precisa informar o campo de destino.");
    return errors;
  }
  if (node.type === "occurrence.create") {
    const priority = configurationText(configuration, "priority");
    const status = configurationText(configuration, "status");
    const origin = configurationText(configuration, "origin");
    const creationMode = configurationText(configuration, "creationMode");
    const errors = [];
    if (!configurationText(configuration, "category")) errors.push("A criação de ocorrência precisa de uma categoria.");
    if (!priority) errors.push("A criação de ocorrência precisa de uma prioridade.");
    if (priority && !["baixa", "media", "alta", "critica", "{{alert.priority}}"].includes(priority)) errors.push("A prioridade da ocorrência é inválida.");
    if (creationMode && !["simulacao", "revisao_obrigatoria"].includes(creationMode)) errors.push("O modo de criação da ocorrência é inválido.");
    if (creationMode === "revisao_obrigatoria") {
      for (const [field, label] of [["description", "descrição"], ["address", "endereço"], ["latitude", "latitude"], ["longitude", "longitude"]] as const) {
        if (!configurationText(configuration, field)) errors.push(`A revisão humana precisa mapear ${label}.`);
      }
    }
    if (status && !["triagem", "aguardando_despacho", "despachada", "aceita", "em_atendimento", "pausada", "concluida", "cancelada"].includes(status)) errors.push("A situação inicial da ocorrência é inválida.");
    if (origin && !["central", "telefone", "chat", "video", "sensor", "agente", "integracao"].includes(origin)) errors.push("A origem da ocorrência é inválida.");
    for (const coordinate of ["latitude", "longitude"]) {
      const value = configurationText(configuration, coordinate);
      if (value && !["{{alert.latitude}}", "{{alert.longitude}}"].includes(value) && !Number.isFinite(Number(value))) errors.push(`O campo ${coordinate} precisa conter uma coordenada numérica.`);
    }
    for (const resource of ["assignedTeamId", "assignedVehicleId"]) {
      const value = configurationText(configuration, resource);
      if (value && (!Number.isInteger(Number(value)) || Number(value) <= 0)) errors.push(`O campo ${resource} precisa conter um identificador positivo.`);
    }
    return errors;
  }
  if (node.type === "dispatch.simulate") {
    const strategy = configurationText(configuration, "strategy");
    return ["manual", "primeira_disponivel"].includes(strategy) ? [] : ["O despacho simulado precisa de uma estratégia válida."];
  }
  if (node.type === "notification.simulate") {
    const channel = configurationText(configuration, "channel");
    const errors = [];
    if (!channel) errors.push("A notificação simulada precisa de um canal.");
    if (channel && !["painel_interno", "email_simulado", "webhook_simulado"].includes(channel)) errors.push("O canal de notificação é inválido.");
    if (!configurationText(configuration, "messageTemplate")) errors.push("A notificação simulada precisa de uma mensagem.");
    return errors;
  }
  if (["trail.start", "trail.end"].includes(node.type)) return [];
  return ["O tipo de nó informado não é suportado."];
}

export function validateWorkflowDefinition(value: unknown, options: { forPublication?: boolean } = {}): WorkflowValidationReport {
  const definition = normalizeWorkflowDefinition(value);
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  for (const node of definition.nodes) {
    if (!node.id.trim()) errors.push("Todo nó precisa de um identificador.");
    if (nodeIds.has(node.id)) errors.push(`O identificador de nó ${node.id} está duplicado.`);
    nodeIds.add(node.id);
    const configurationErrors = getWorkflowNodeConfigurationErrors(node);
    if (options.forPublication) errors.push(...configurationErrors.map(error => `${node.label}: ${error}`));
    else warnings.push(...configurationErrors.map(error => `${node.label}: ${error}`));
  }
  for (const edge of definition.edges) {
    if (edgeIds.has(edge.id)) errors.push(`A conexão ${edge.id} está duplicada.`);
    edgeIds.add(edge.id);
    if (edge.source === edge.target) errors.push(`A conexão ${edge.id} não pode retornar ao mesmo nó.`);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) errors.push(`A conexão ${edge.id} aponta para um nó inexistente.`);
  }
  if (!definition.nodes.length) warnings.push("Inclua ao menos um nó antes de publicar o workflow.");
  const triggerNodes = definition.nodes.filter(node => node.type.startsWith("trigger."));
  const trailStarts = definition.nodes.filter(node => node.type === "trail.start");
  const trailEnds = definition.nodes.filter(node => node.type === "trail.end");
  if (definition.nodes.length && !triggerNodes.length) warnings.push("Inclua um gatilho para indicar como o workflow deve começar.");
  const nodesWithInput = new Set(definition.edges.map(edge => edge.target));
  const nodesWithOutput = new Set(definition.edges.map(edge => edge.source));
  const disconnected = definition.nodes.filter(node => !node.type.startsWith("trigger.") && !nodesWithInput.has(node.id));
  if (disconnected.length) warnings.push("Há nós sem conexão de entrada.");
  if (options.forPublication) {
    if (!definition.nodes.length) errors.push("Um workflow publicado precisa conter nós.");
    if (!triggerNodes.length) errors.push("Um workflow publicado precisa iniciar por um gatilho.");
    if (trailStarts.length || trailEnds.length) {
      if (trailStarts.length !== 1) errors.push("A trilha precisa conter exatamente um marcador de início.");
      if (trailEnds.length !== 1) errors.push("A trilha precisa conter exatamente um marcador de fim.");
      for (const start of trailStarts) if (!nodesWithInput.has(start.id)) errors.push(`O marcador de início "${start.label}" precisa receber a conexão do gatilho.`);
      for (const end of trailEnds) {
        if (!nodesWithInput.has(end.id)) errors.push(`O marcador de fim "${end.label}" precisa receber uma conexão de entrada.`);
        if (nodesWithOutput.has(end.id)) errors.push(`O marcador de fim "${end.label}" não pode possuir conexões de saída.`);
      }
    }
    if (definition.nodes.length > 1 && !definition.edges.length) errors.push("Conecte os nós antes de publicar o workflow.");
    if (definition.nodes.length > 1) {
      for (const trigger of triggerNodes) {
        if (nodesWithInput.has(trigger.id)) errors.push(`O gatilho "${trigger.label}" não pode receber conexões de entrada.`);
        if (!nodesWithOutput.has(trigger.id)) errors.push(`O gatilho "${trigger.label}" precisa iniciar ao menos uma conexão.`);
      }
      for (const node of disconnected) errors.push(`O nó "${node.label}" precisa receber uma conexão de entrada.`);
      const edgesBySource = new Map<string, string[]>();
      for (const edge of definition.edges) edgesBySource.set(edge.source, [...(edgesBySource.get(edge.source) ?? []), edge.target]);
      const reachable = new Set<string>();
      const queue = triggerNodes.map(node => node.id);
      while (queue.length) {
        const current = queue.shift();
        if (!current || reachable.has(current)) continue;
        reachable.add(current);
        for (const target of edgesBySource.get(current) ?? []) queue.push(target);
      }
      for (const node of definition.nodes.filter(node => !reachable.has(node.id))) errors.push(`O nó "${node.label}" não é alcançável a partir de um gatilho.`);
    }
    if (definition.metadata.automation.requestedMode === "producao_protegida") warnings.push("A automação real está apenas preparada: a execução permanece bloqueada até homologação, permissão específica e aprovação operacional.");
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function buildWorkflowAuditLog(input: { workflowId: number; actorUserId: number; action: "create" | "update_versioned" | "publish_activate" | "deactivate" | "delete"; beforeData: Record<string, unknown> | null; afterData: Record<string, unknown> | null }) {
  return { resourceType: "workflow", resourceId: input.workflowId, action: input.action, actorUserId: input.actorUserId, beforeData: input.beforeData, afterData: input.afterData };
}

export type SimulatedExecutionPlan = {
  finalStatus: "concluida" | "falha" | "dead_letter";
  outputData: Record<string, unknown> | null;
  errorData: Record<string, unknown> | null;
  steps: Array<{ nodeId: string; nodeType: string; status: "concluida" | "falha" | "dead_letter"; outputData: Record<string, unknown> | null; errorData: Record<string, unknown> | null; durationMs: number }>;
};

export function buildSimulatedExecutionPlan(definition: unknown, inputData: Record<string, unknown> | null, attempt: number, maxAttempts: number): SimulatedExecutionPlan {
  const normalized = normalizeWorkflowDefinition(definition);
  const edgesBySource = new Map<string, string[]>();
  for (const edge of normalized.edges) edgesBySource.set(edge.source, [...(edgesBySource.get(edge.source) ?? []), edge.target]);
  const nodeById = new Map(normalized.nodes.map(node => [node.id, node]));
  const ordered: WorkflowDefinition["nodes"] = [];
  const visited = new Set<string>();
  const queue = normalized.nodes.filter(node => node.type.startsWith("trigger.")).map(node => node.id);
  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    const node = nodeById.get(nodeId);
    if (!node) continue;
    visited.add(nodeId);
    ordered.push(node);
    for (const target of edgesBySource.get(nodeId) ?? []) queue.push(target);
  }
  const executionNodes = ordered.length === normalized.nodes.length ? ordered : normalized.nodes;
  const forcedFailure = inputData?.simulateFailure === true || executionNodes.some(node => node.configuration.forceFailure === true);
  const failureStatus = attempt >= maxAttempts ? "dead_letter" as const : "falha" as const;
  const failureNodeId = executionNodes.at(-1)?.id;
  const steps = executionNodes.map((node, index) => {
    const shouldFail = forcedFailure && node.id === failureNodeId;
    return {
      nodeId: node.id,
      nodeType: node.type,
      status: shouldFail ? failureStatus : "concluida" as const,
      outputData: shouldFail ? null : { simulation: true, nodeLabel: node.label, processedOrder: index + 1 },
      errorData: shouldFail ? { code: "SIMULATION_FAILURE", message: "Falha controlada solicitada para teste de retry." } : null,
      durationMs: 5 + index * 3,
    };
  });
  if (forcedFailure) return { finalStatus: failureStatus, outputData: null, errorData: { code: "SIMULATION_FAILURE", message: "A execução foi interrompida por uma falha controlada de simulação.", retryable: failureStatus === "falha" }, steps };
  return { finalStatus: "concluida", outputData: { simulation: true, nodesProcessed: steps.length, externalRequests: 0, message: "Workflow processado somente em modo de simulação." }, errorData: null, steps };
}

function buildWorkflowExecutionAuditLog(input: { executionId: number; workflowId: number; actorUserId: number; action: "queue" | "complete" | "fail" | "dead_letter" | "retry"; beforeData: Record<string, unknown> | null; afterData: Record<string, unknown> | null }) {
  return { resourceType: "workflow_execution", resourceId: input.executionId, action: `workflow_execution.${input.action}`, actorUserId: input.actorUserId, beforeData: { workflowId: input.workflowId, ...input.beforeData }, afterData: input.afterData };
}

async function processSimulatedWorkflowExecution(executionId: number, actorUserId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const execution = (await tx.select().from(workflowExecutions).where(eq(workflowExecutions.id, executionId)).limit(1))[0];
    if (!execution) throw new Error("Execução não encontrada.");
    if (execution.mode !== "simulacao") throw new Error("Este executor aceita somente execuções em modo de simulação.");
    if (execution.status !== "pendente") return { executionId, status: execution.status, skipped: true };
    const version = execution.workflowVersionId ? (await tx.select().from(workflowVersions).where(eq(workflowVersions.id, execution.workflowVersionId)).limit(1))[0] : null;
    if (!version) throw new Error("A versão do workflow desta execução não foi encontrada.");
    const attempt = execution.attempts + 1;
    const now = new Date();
    const plan = buildSimulatedExecutionPlan(version.definition, execution.inputData, attempt, execution.maxAttempts);
    await tx.update(workflowExecutions).set({ status: "em_execucao", attempts: attempt, startedAt: now }).where(eq(workflowExecutions.id, executionId));
    await tx.insert(integrationLogs).values({ executionId, workflowId: execution.workflowId, level: "info", source: "workflow.executor.simulacao", message: "Execução retirada da fila para processamento controlado.", requestData: { mode: "simulacao", attempt, externalRequests: 0 }, retryAttempt: attempt - 1 });
    for (const step of plan.steps) {
      await tx.insert(workflowExecutionSteps).values({ executionId, nodeId: step.nodeId, nodeType: step.nodeType, status: step.status, inputData: { simulation: true }, outputData: step.outputData, errorData: step.errorData, durationMs: step.durationMs, startedAt: now, completedAt: new Date(now.getTime() + step.durationMs) });
    }
    const completedAt = new Date(now.getTime() + plan.steps.reduce((total, step) => total + step.durationMs, 0));
    await tx.update(workflowExecutions).set({ status: plan.finalStatus, outputData: plan.outputData, errorData: plan.errorData, completedAt, nextAttemptAt: plan.finalStatus === "falha" ? new Date(completedAt.getTime() + 60_000) : null }).where(eq(workflowExecutions.id, executionId));
    const level = plan.finalStatus === "concluida" ? "sucesso" : "erro";
    const action = plan.finalStatus === "concluida" ? "complete" : plan.finalStatus === "dead_letter" ? "dead_letter" : "fail";
    await tx.insert(integrationLogs).values({ executionId, workflowId: execution.workflowId, level, source: "workflow.executor.simulacao", message: plan.finalStatus === "concluida" ? "Execução simulada concluída sem chamadas externas." : "Execução simulada finalizada com falha controlada.", responseData: plan.outputData, retryAttempt: attempt - 1, errorCode: plan.errorData?.code as string | undefined });
    await tx.insert(auditLogs).values(buildWorkflowExecutionAuditLog({ executionId, workflowId: execution.workflowId, actorUserId, action, beforeData: { status: "pendente", attempts: execution.attempts }, afterData: { status: plan.finalStatus, attempts: attempt, simulationOnly: true } }));
    return { executionId, status: plan.finalStatus, attempts: attempt, outputData: plan.outputData, errorData: plan.errorData };
  });
}

export async function executeSimulatedWorkflow(input: { workflowId: number; actorUserId: number; inputData?: Record<string, unknown> | null; attemptsBefore?: number; retrySourceExecutionId?: number }) {
  const db = await requireDb();
  const queued = await db.transaction(async tx => {
    const workflow = (await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1))[0];
    if (!workflow) throw new Error("Workflow não encontrado.");
    if (!workflow.simulationOnly) throw new Error("Esta entrega executa somente workflows em modo de simulação.");
    if (!workflow.active) throw new Error("Publique e ative o workflow antes de executar uma simulação.");
    const version = (await tx.select().from(workflowVersions).where(and(eq(workflowVersions.workflowId, input.workflowId), eq(workflowVersions.version, workflow.currentVersion))).limit(1))[0];
    if (!version) throw new Error("A versão atual do workflow não foi encontrada.");
    const validation = validateWorkflowDefinition(version.definition, { forPublication: true });
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    const attemptsBefore = input.attemptsBefore ?? 0;
    const triggerType = input.retrySourceExecutionId ? "manual_retry" : "manual";
    const [created] = await tx.insert(workflowExecutions).values({ workflowId: input.workflowId, workflowVersionId: version.id, triggerType, mode: "simulacao", status: "pendente", idempotencyKey: `${triggerType}-${nanoid(18)}`, inputData: { simulation: true, ...(input.inputData ?? {}), ...(input.retrySourceExecutionId ? { reprocessedFromExecutionId: input.retrySourceExecutionId } : {}) }, attempts: attemptsBefore, maxAttempts: 3, retryOfExecutionId: input.retrySourceExecutionId ?? null, initiatedByUserId: input.actorUserId }).$returningId();
    await tx.insert(integrationLogs).values({ executionId: created.id, workflowId: input.workflowId, level: "info", source: "workflow.executor.simulacao", message: input.retrySourceExecutionId ? "Nova tentativa reenfileirada em modo de simulação." : "Execução manual enfileirada em modo de simulação.", requestData: { externalRequests: 0, retrySourceExecutionId: input.retrySourceExecutionId ?? null }, retryAttempt: attemptsBefore });
    await tx.insert(auditLogs).values(buildWorkflowExecutionAuditLog({ executionId: created.id, workflowId: input.workflowId, actorUserId: input.actorUserId, action: "queue", beforeData: null, afterData: { status: "pendente", triggerType, attemptsBefore, simulationOnly: true } }));
    return created.id;
  });
  return processSimulatedWorkflowExecution(queued, input.actorUserId);
}

export async function retrySimulatedWorkflowExecution(input: { executionId: number; actorUserId: number }) {
  const db = await requireDb();
  const source = await db.transaction(async tx => {
    const current = (await tx.select().from(workflowExecutions).where(eq(workflowExecutions.id, input.executionId)).limit(1))[0];
    if (!current) throw new Error("Execução não encontrada.");
    if (current.mode !== "simulacao" || current.status !== "falha") throw new Error("Somente execuções simuladas em falha podem ser reenfileiradas.");
    const existingRetry = (await tx.select().from(workflowExecutions).where(eq(workflowExecutions.retryOfExecutionId, current.id)).limit(1))[0];
    if (existingRetry) throw new Error("Esta falha já foi reprocessada. Use a tentativa mais recente para continuar o ciclo.");
    return current;
  });
  let result: Awaited<ReturnType<typeof executeSimulatedWorkflow>>;
  try {
    result = await executeSimulatedWorkflow({ workflowId: source.workflowId, actorUserId: input.actorUserId, inputData: source.inputData, attemptsBefore: source.attempts, retrySourceExecutionId: source.id });
  } catch (error) {
    if (error instanceof Error && error.message.includes("workflow_executions_retry_source_unique")) throw new Error("Esta falha já foi reprocessada por outra solicitação. Atualize o histórico para usar a tentativa mais recente.");
    throw error;
  }
  await db.transaction(async tx => {
    await tx.insert(integrationLogs).values({ executionId: source.id, workflowId: source.workflowId, level: "aviso", source: "workflow.executor.simulacao", message: "Execução reprocessada em novo registro para preservar etapas e histórico da tentativa anterior.", requestData: { newExecutionId: result.executionId }, retryAttempt: source.attempts });
    await tx.insert(auditLogs).values(buildWorkflowExecutionAuditLog({ executionId: source.id, workflowId: source.workflowId, actorUserId: input.actorUserId, action: "retry", beforeData: { status: source.status, attempts: source.attempts }, afterData: { newExecutionId: result.executionId, nextAttempt: source.attempts + 1, simulationOnly: true } }));
  });
  return result;
}

export async function listSimulatedWorkflowExecutions(input: { workflowId?: number; limit?: number } = {}) {
  const db = await requireDb();
  const filters = [eq(workflowExecutions.mode, "simulacao")];
  if (input.workflowId) filters.push(eq(workflowExecutions.workflowId, input.workflowId));
  return db.select({ execution: workflowExecutions, workflowName: workflows.name, initiatorName: users.name }).from(workflowExecutions).innerJoin(workflows, eq(workflows.id, workflowExecutions.workflowId)).leftJoin(users, eq(users.id, workflowExecutions.initiatedByUserId)).where(and(...filters)).orderBy(desc(workflowExecutions.createdAt)).limit(Math.min(input.limit ?? 50, 100));
}

export async function getSimulatedWorkflowExecution(executionId: number) {
  const db = await requireDb();
  const [execution] = await db.select({ execution: workflowExecutions, workflowName: workflows.name, initiatorName: users.name }).from(workflowExecutions).innerJoin(workflows, eq(workflows.id, workflowExecutions.workflowId)).leftJoin(users, eq(users.id, workflowExecutions.initiatedByUserId)).where(eq(workflowExecutions.id, executionId)).limit(1);
  if (!execution || execution.execution.mode !== "simulacao") throw new Error("Execução simulada não encontrada.");
  const [steps, logs] = await Promise.all([db.select().from(workflowExecutionSteps).where(eq(workflowExecutionSteps.executionId, executionId)).orderBy(desc(workflowExecutionSteps.createdAt)), db.select().from(integrationLogs).where(eq(integrationLogs.executionId, executionId)).orderBy(desc(integrationLogs.createdAt))]);
  return { ...execution, steps, logs };
}

export async function createSimulatedWorkflow(input: { name: string; description?: string | null; actorUserId: number }) {
  const db = await requireDb();
  const definition = createInitialSimulatedWorkflowDefinition();
  return db.transaction(async tx => {
    const [created] = await tx.insert(workflows).values({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      status: "rascunho",
      active: false,
      currentVersion: 1,
      simulationOnly: true,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
    }).$returningId();
    const [version] = await tx.insert(workflowVersions).values({
      workflowId: created.id,
      version: 1,
      definition,
      validationReport: { valid: true, warnings: ["Workflow criado em modo SIMULAÇÃO / MOCK."] },
      changeSummary: "Versão inicial simulada",
      createdByUserId: input.actorUserId,
    }).$returningId();
    await tx.insert(auditLogs).values(buildWorkflowAuditLog({ workflowId: created.id, actorUserId: input.actorUserId, action: "create", beforeData: null, afterData: { name: input.name.trim(), description: input.description?.trim() || null, status: "rascunho", active: false, version: 1, versionId: version.id, simulationOnly: true } }));
    return { id: created.id, versionId: version.id };
  });
}

export async function listSimulatedWorkflows() {
  const db = await requireDb();
  return db.select({ workflow: workflows, creatorName: users.name }).from(workflows).leftJoin(users, eq(workflows.createdByUserId, users.id)).orderBy(desc(workflows.updatedAt));
}

export async function getSimulatedWorkflow(workflowId: number) {
  const db = await requireDb();
  const [workflow, versions] = await Promise.all([
    db.select({ workflow: workflows, creatorName: users.name }).from(workflows).leftJoin(users, eq(workflows.createdByUserId, users.id)).where(eq(workflows.id, workflowId)).limit(1),
    db.select().from(workflowVersions).where(eq(workflowVersions.workflowId, workflowId)).orderBy(desc(workflowVersions.version)),
  ]);
  if (!workflow[0]) throw new Error("Workflow não encontrado.");
  return { ...workflow[0], versions };
}

export async function updateSimulatedWorkflow(input: { workflowId: number; name: string; description?: string | null; definition?: unknown; changeSummary?: string | null; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1))[0];
    if (!before) throw new Error("Workflow não encontrado.");
    if (!before.simulationOnly) throw new Error("Esta entrega permite editar somente workflows em modo de simulação.");
    const latestVersion = (await tx.select().from(workflowVersions).where(and(eq(workflowVersions.workflowId, input.workflowId), eq(workflowVersions.version, before.currentVersion))).limit(1))[0];
    if (!latestVersion) throw new Error("A versão atual do workflow não foi encontrada.");
    const nextDefinition = input.definition === undefined ? normalizeWorkflowDefinition(latestVersion.definition) : normalizeWorkflowDefinition(input.definition);
    const validationReport = validateWorkflowDefinition(nextDefinition);
    if (!validationReport.valid) throw new Error(validationReport.errors.join(" "));
    const nextVersion = before.currentVersion + 1;
    const name = input.name.trim();
    const description = input.description?.trim() || null;
    const changeSummary = input.changeSummary?.trim() || "Metadados atualizados em modo de simulação";
    await tx.update(workflows).set({ name, description, currentVersion: nextVersion, updatedByUserId: input.actorUserId }).where(eq(workflows.id, input.workflowId));
    const [createdVersion] = await tx.insert(workflowVersions).values({
      workflowId: input.workflowId,
      version: nextVersion,
      definition: nextDefinition,
      validationReport,
      changeSummary,
      createdByUserId: input.actorUserId,
    }).$returningId();
    await tx.insert(auditLogs).values(buildWorkflowAuditLog({ workflowId: input.workflowId, actorUserId: input.actorUserId, action: "update_versioned", beforeData: { name: before.name, description: before.description, currentVersion: before.currentVersion }, afterData: { name, description, currentVersion: nextVersion, versionId: createdVersion.id, changeSummary } }));
    return { id: input.workflowId, versionId: createdVersion.id, version: nextVersion };
  });
}

export async function setSimulatedWorkflowActive(input: { workflowId: number; active: boolean; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1))[0];
    if (!before) throw new Error("Workflow não encontrado.");
    if (!before.simulationOnly) throw new Error("Esta entrega permite alterar somente workflows em modo de simulação.");
    const latestVersion = (await tx.select().from(workflowVersions).where(and(eq(workflowVersions.workflowId, input.workflowId), eq(workflowVersions.version, before.currentVersion))).limit(1))[0];
    if (input.active) {
      const validation = validateWorkflowDefinition(latestVersion?.definition, { forPublication: true });
      if (!validation.valid) throw new Error(validation.errors.join(" "));
    }
    const now = new Date();
    const patch = input.active
      ? { status: "publicado" as const, active: true, publishedAt: before.publishedAt ?? now, updatedByUserId: input.actorUserId }
      : { active: false, updatedByUserId: input.actorUserId };
    await tx.update(workflows).set(patch).where(eq(workflows.id, input.workflowId));
    await tx.insert(auditLogs).values(buildWorkflowAuditLog({ workflowId: input.workflowId, actorUserId: input.actorUserId, action: input.active ? "publish_activate" : "deactivate", beforeData: { status: before.status, active: before.active, publishedAt: before.publishedAt?.toISOString() ?? null }, afterData: { status: input.active ? "publicado" : before.status, active: input.active, publishedAt: input.active ? (before.publishedAt ?? now).toISOString() : before.publishedAt?.toISOString() ?? null } }));
  });
}

export async function deleteSimulatedWorkflow(input: { workflowId: number; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1))[0];
    if (!before) throw new Error("Workflow não encontrado.");
    if (!before.simulationOnly) throw new Error("Esta entrega permite excluir somente workflows em modo de simulação.");
    await tx.delete(workflows).where(eq(workflows.id, input.workflowId));
    await tx.insert(auditLogs).values(buildWorkflowAuditLog({ workflowId: input.workflowId, actorUserId: input.actorUserId, action: "delete", beforeData: { name: before.name, description: before.description, status: before.status, active: before.active, currentVersion: before.currentVersion, simulationOnly: before.simulationOnly }, afterData: null }));
  });
}

export async function getSimulatedIntegrationMetrics() {
  const db = await requireDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [activeRows, connectionRows, executionRows] = await Promise.all([
    db.select({ total: count() }).from(workflows).where(and(eq(workflows.active, true), eq(workflows.simulationOnly, true))),
    db.select({ total: count() }).from(integrationConnections).where(and(eq(integrationConnections.simulationOnly, true), eq(integrationConnections.active, true))),
    db.select({ status: workflowExecutions.status, startedAt: workflowExecutions.startedAt, completedAt: workflowExecutions.completedAt }).from(workflowExecutions).where(and(eq(workflowExecutions.mode, "simulacao"), gte(workflowExecutions.createdAt, since))),
  ]);
  const completed = executionRows.filter(row => row.status === "concluida");
  const errored = executionRows.filter(row => ["falha", "dead_letter"].includes(row.status));
  const durations = completed.flatMap(row => row.startedAt && row.completedAt ? [row.completedAt.getTime() - row.startedAt.getTime()] : []);
  return {
    activeWorkflows: Number(activeRows[0]?.total ?? 0),
    registeredConnections: Number(connectionRows[0]?.total ?? 0),
    executionsLast24Hours: executionRows.length,
    successRate: executionRows.length ? Math.round((completed.length / executionRows.length) * 100) : null,
    errorsLast24Hours: errored.length,
    averageDurationMs: durations.length ? Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length) : null,
  };
}

export async function listIntegrationEventCatalog() {
  const db = await requireDb();
  return db.select().from(integrationEventCatalog).orderBy(integrationEventCatalog.code, integrationEventCatalog.version);
}

function normalizeIntegrationCode(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function validateSimulatedEndpoint(value: string | null | undefined) {
  if (!value?.trim()) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Informe uma URL HTTPS válida para a conexão simulada."); }
  if (url.protocol !== "https:") throw new Error("Conexões simuladas aceitam somente URLs HTTPS.");
  const host = url.hostname.toLowerCase();
  const privateIpv4 = /^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || privateIpv4 || host.includes(":")) throw new Error("O endereço informado não é permitido por proteção contra SSRF.");
  return url.toString();
}

export function maskIntegrationData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskIntegrationData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, /(authorization|cookie|credential|password|secret|token|api.?key)/i.test(key) ? "••••••••" : maskIntegrationData(item)]));
}

function integrationAudit(input: { resourceType: string; resourceId: number; actorUserId: number; action: string; beforeData: Record<string, unknown> | null; afterData: Record<string, unknown> | null }) {
  return { resourceType: input.resourceType, resourceId: input.resourceId, action: input.action, actorUserId: input.actorUserId, beforeData: input.beforeData, afterData: input.afterData };
}

export async function listSimulatedIntegrationConnections() {
  const db = await requireDb();
  return db.select().from(integrationConnections).where(eq(integrationConnections.simulationOnly, true)).orderBy(desc(integrationConnections.updatedAt));
}

export async function createSimulatedIntegrationConnection(input: { code: string; name: string; description?: string | null; connectionType: string; baseUrl?: string | null; actorUserId: number }) {
  const db = await requireDb();
  const code = normalizeIntegrationCode(input.code);
  if (code.length < 3) throw new Error("O código da conexão deve ter ao menos 3 caracteres válidos.");
  const baseUrl = validateSimulatedEndpoint(input.baseUrl);
  return db.transaction(async tx => {
    const [created] = await tx.insert(integrationConnections).values({ code, name: input.name.trim(), description: input.description?.trim() || null, connectionType: input.connectionType.trim(), environment: "simulacao", baseUrl, active: false, simulationOnly: true, configuration: { mode: "SIMULAÇÃO / MOCK", delivery: "desativada", ssrfValidation: true }, createdByUserId: input.actorUserId, updatedByUserId: input.actorUserId }).$returningId();
    await tx.insert(auditLogs).values(integrationAudit({ resourceType: "integration_connection", resourceId: created.id, actorUserId: input.actorUserId, action: "create_simulation", beforeData: null, afterData: { code, name: input.name.trim(), connectionType: input.connectionType.trim(), baseUrl, active: false, simulationOnly: true } }));
    return { id: created.id };
  });
}

export function getAlrtHomologationConnectionDefaults() {
  return {
    code: "despacho-alrt-homologacao",
    name: "Despacho ALRT — Eventos",
    description: "Referência de homologação para o endpoint de eventos do Despacho ALRT. O cadastro não realiza chamadas HTTP nem habilita processamento produtivo.",
    connectionType: "http_eventos_referencia",
    environment: "homologacao",
    baseUrl: "https://despachoalrt-hjwc4f8q.manus.space/eventos",
    configuration: { mode: "HOMOLOGAÇÃO / MOCK", delivery: "desativada", externalRequestsEnabled: false, authentication: "pendente", endpointReachability: "nao_verificada" },
  } as const;
}

export async function activateAlrtHomologationConnection(input: { actorUserId: number }) {
  const db = await requireDb();
  const defaults = getAlrtHomologationConnectionDefaults();
  return db.transaction(async tx => {
    const before = (await tx.select().from(integrationConnections).where(eq(integrationConnections.code, defaults.code)).limit(1))[0];
    if (before && !before.simulationOnly) throw new Error("A conexão ALRT existente não é de homologação simulada e não pode ser alterada por esta ação.");
    let connectionId: number;
    if (before) {
      await tx.update(integrationConnections).set({ name: defaults.name, description: defaults.description, connectionType: defaults.connectionType, environment: defaults.environment, baseUrl: defaults.baseUrl, active: true, simulationOnly: true, configuration: defaults.configuration, updatedByUserId: input.actorUserId }).where(eq(integrationConnections.id, before.id));
      connectionId = before.id;
    } else {
      const [created] = await tx.insert(integrationConnections).values({ ...defaults, active: true, simulationOnly: true, createdByUserId: input.actorUserId, updatedByUserId: input.actorUserId }).$returningId();
      connectionId = created.id;
    }
    await tx.insert(auditLogs).values(integrationAudit({ resourceType: "integration_connection", resourceId: connectionId, actorUserId: input.actorUserId, action: before ? "reactivate_homologation_reference" : "create_homologation_reference", beforeData: before ? { code: before.code, baseUrl: before.baseUrl, active: before.active, environment: before.environment, simulationOnly: before.simulationOnly } : null, afterData: { ...defaults, active: true, simulationOnly: true } }));
    return { id: connectionId, created: !before, active: true, simulationOnly: true, externalRequestsEnabled: false };
  });
}

export async function approveAlrtProductionReadiness(input: { actorUserId: number }) {
  const db = await requireDb();
  const defaults = getAlrtHomologationConnectionDefaults();
  return db.transaction(async tx => {
    const before = (await tx.select().from(integrationConnections).where(eq(integrationConnections.code, defaults.code)).limit(1))[0];
    if (!before || !before.simulationOnly) throw new Error("A referência de homologação ALRT não está disponível para pré-aprovação.");
    const previousConfiguration = before.configuration ?? {};
    const approvedAt = new Date().toISOString();
    const productionReadiness = {
      state: "aguardando_homologacao",
      approvedByAdministrator: true,
      approvedAt,
      direction: "alrt_to_axe",
      activationAllowed: false,
      externalRequestsEnabled: false,
      pending: ["contrato de evento versionado", "credencial produtiva", "homologação autenticada", "monitoramento e chave de desligamento"],
    };
    const configuration = { ...previousConfiguration, productionReadiness };
    await tx.update(integrationConnections).set({ configuration, active: true, simulationOnly: true, updatedByUserId: input.actorUserId }).where(eq(integrationConnections.id, before.id));
    await tx.insert(auditLogs).values(integrationAudit({ resourceType: "integration_connection", resourceId: before.id, actorUserId: input.actorUserId, action: "production_preapproval_recorded", beforeData: { simulationOnly: before.simulationOnly, active: before.active, productionReadiness: (previousConfiguration as Record<string, unknown>).productionReadiness ?? null }, afterData: { simulationOnly: true, active: true, productionReadiness } }));
    return { id: before.id, approvedAt, simulationOnly: true, externalRequestsEnabled: false, activationAllowed: false };
  });
}

export async function isAlrtIngressAdministrativelyApproved() {
  const db = await requireDb();
  const connection = (await db.select({ configuration: integrationConnections.configuration }).from(integrationConnections).where(eq(integrationConnections.code, getAlrtHomologationConnectionDefaults().code)).limit(1))[0];
  const configuration = connection?.configuration;
  if (!configuration || typeof configuration !== "object") return false;
  const readiness = (configuration as { productionReadiness?: { approvedByAdministrator?: unknown; activationAllowed?: unknown } }).productionReadiness;
  return readiness?.approvedByAdministrator === true && readiness.activationAllowed === false;
}

export async function updateSimulatedIntegrationConnection(input: { connectionId: number; code: string; name: string; description?: string | null; connectionType: string; baseUrl?: string | null; actorUserId: number }) {
  const db = await requireDb();
  const code = normalizeIntegrationCode(input.code);
  if (code.length < 3) throw new Error("O código da conexão deve ter ao menos 3 caracteres válidos.");
  const baseUrl = validateSimulatedEndpoint(input.baseUrl);
  return db.transaction(async tx => {
    const before = (await tx.select().from(integrationConnections).where(eq(integrationConnections.id, input.connectionId)).limit(1))[0];
    if (!before?.simulationOnly) throw new Error("Conexão simulada não encontrada.");
    await tx.update(integrationConnections).set({ code, name: input.name.trim(), description: input.description?.trim() || null, connectionType: input.connectionType.trim(), baseUrl, active: false, updatedByUserId: input.actorUserId }).where(eq(integrationConnections.id, input.connectionId));
    await tx.insert(auditLogs).values(integrationAudit({ resourceType: "integration_connection", resourceId: input.connectionId, actorUserId: input.actorUserId, action: "update_simulation", beforeData: { code: before.code, name: before.name, baseUrl: before.baseUrl, active: before.active }, afterData: { code, name: input.name.trim(), baseUrl, active: false, simulationOnly: true } }));
  });
}

export async function deleteSimulatedIntegrationConnection(input: { connectionId: number; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(integrationConnections).where(eq(integrationConnections.id, input.connectionId)).limit(1))[0];
    if (!before?.simulationOnly) throw new Error("Conexão simulada não encontrada.");
    await tx.delete(integrationConnections).where(eq(integrationConnections.id, input.connectionId));
    await tx.insert(auditLogs).values(integrationAudit({ resourceType: "integration_connection", resourceId: input.connectionId, actorUserId: input.actorUserId, action: "delete_simulation", beforeData: { code: before.code, name: before.name, baseUrl: before.baseUrl, simulationOnly: true }, afterData: null }));
  });
}

export async function listSimulatedIntegrationWebhooks() {
  const db = await requireDb();
  return db.select({ webhook: integrationWebhooks, workflowName: workflows.name }).from(integrationWebhooks).leftJoin(workflows, eq(workflows.id, integrationWebhooks.workflowId)).where(eq(integrationWebhooks.simulationOnly, true)).orderBy(desc(integrationWebhooks.updatedAt));
}

export async function createSimulatedIntegrationWebhook(input: { name: string; method: string; path: string; workflowId?: number | null; allowedIps?: string[] | null; actorUserId: number }) {
  const db = await requireDb();
  const path = input.path.trim();
  if (!/^\/[a-z0-9/_-]*$/i.test(path)) throw new Error("O caminho do webhook deve começar com / e conter somente letras, números, _ ou -.");
  return db.transaction(async tx => {
    const [created] = await tx.insert(integrationWebhooks).values({ name: input.name.trim(), method: input.method.toUpperCase(), path, workflowId: input.workflowId ?? null, allowedIps: input.allowedIps?.filter(Boolean) ?? null, active: false, simulationOnly: true, timeoutMs: 15000, createdByUserId: input.actorUserId, updatedByUserId: input.actorUserId }).$returningId();
    await tx.insert(auditLogs).values(integrationAudit({ resourceType: "integration_webhook", resourceId: created.id, actorUserId: input.actorUserId, action: "create_simulation", beforeData: null, afterData: { name: input.name.trim(), method: input.method.toUpperCase(), path, workflowId: input.workflowId ?? null, active: false, simulationOnly: true } }));
    return { id: created.id };
  });
}

export async function deleteSimulatedIntegrationWebhook(input: { webhookId: number; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(integrationWebhooks).where(eq(integrationWebhooks.id, input.webhookId)).limit(1))[0];
    if (!before?.simulationOnly) throw new Error("Webhook simulado não encontrado.");
    await tx.delete(integrationWebhooks).where(eq(integrationWebhooks.id, input.webhookId));
    await tx.insert(auditLogs).values(integrationAudit({ resourceType: "integration_webhook", resourceId: input.webhookId, actorUserId: input.actorUserId, action: "delete_simulation", beforeData: { name: before.name, path: before.path, method: before.method, simulationOnly: true }, afterData: null }));
  });
}

export async function listSimulatedIntegrationCredentials() {
  const db = await requireDb();
  return db.select({ id: integrationCredentials.id, name: integrationCredentials.name, credentialType: integrationCredentials.credentialType, environment: integrationCredentials.environment, description: integrationCredentials.description, maskedSummary: integrationCredentials.maskedSummary, keyVersion: integrationCredentials.keyVersion, expiresAt: integrationCredentials.expiresAt, active: integrationCredentials.active, simulationOnly: integrationCredentials.simulationOnly, createdAt: integrationCredentials.createdAt, updatedAt: integrationCredentials.updatedAt }).from(integrationCredentials).where(eq(integrationCredentials.simulationOnly, true)).orderBy(desc(integrationCredentials.updatedAt));
}

export async function createSimulatedIntegrationCredential(input: { name: string; credentialType: string; description?: string | null; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [created] = await tx.insert(integrationCredentials).values({ name: input.name.trim(), credentialType: input.credentialType.trim(), environment: "simulacao", description: input.description?.trim() || null, maskedSummary: "SIMULAÇÃO / MOCK — nenhum segredo fornecido", encryptedPayload: null, keyVersion: "placeholder-v1", active: false, simulationOnly: true, createdByUserId: input.actorUserId, updatedByUserId: input.actorUserId }).$returningId();
    await tx.insert(auditLogs).values(integrationAudit({ resourceType: "integration_credential", resourceId: created.id, actorUserId: input.actorUserId, action: "create_placeholder", beforeData: null, afterData: { name: input.name.trim(), credentialType: input.credentialType.trim(), maskedSummary: "SIMULAÇÃO / MOCK", encryptedPayloadStored: false, simulationOnly: true } }));
    return { id: created.id };
  });
}

export async function deleteSimulatedIntegrationCredential(input: { credentialId: number; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = (await tx.select().from(integrationCredentials).where(eq(integrationCredentials.id, input.credentialId)).limit(1))[0];
    if (!before?.simulationOnly) throw new Error("Credencial simulada não encontrada.");
    await tx.delete(integrationCredentials).where(eq(integrationCredentials.id, input.credentialId));
    await tx.insert(auditLogs).values(integrationAudit({ resourceType: "integration_credential", resourceId: input.credentialId, actorUserId: input.actorUserId, action: "delete_placeholder", beforeData: { name: before.name, credentialType: before.credentialType, maskedSummary: before.maskedSummary, encryptedPayloadStored: Boolean(before.encryptedPayload) }, afterData: null }));
  });
}

export async function listSanitizedIntegrationLogs(input: { limit?: number; workflowId?: number; level?: "info" | "aviso" | "erro" } = {}) {
  const db = await requireDb();
  const filters = [];
  if (input.workflowId) filters.push(eq(integrationLogs.workflowId, input.workflowId));
  if (input.level) filters.push(eq(integrationLogs.level, input.level));
  const rows = await db.select().from(integrationLogs).where(filters.length ? and(...filters) : undefined).orderBy(desc(integrationLogs.createdAt)).limit(Math.min(input.limit ?? 100, 200));
  return rows.map(row => ({ ...row, requestData: maskIntegrationData(row.requestData), responseData: maskIntegrationData(row.responseData) }));
}

export async function listImportedOpenapiSpecs() {
  const db = await requireDb();
  return db.select({ spec: integrationOpenapiSpecs, creatorName: users.name }).from(integrationOpenapiSpecs).leftJoin(users, eq(users.id, integrationOpenapiSpecs.createdByUserId)).where(eq(integrationOpenapiSpecs.simulationOnly, true)).orderBy(desc(integrationOpenapiSpecs.updatedAt));
}

export async function getImportedOpenapiSpec(specId: number) {
  const db = await requireDb();
  const spec = (await db.select({ spec: integrationOpenapiSpecs, creatorName: users.name }).from(integrationOpenapiSpecs).leftJoin(users, eq(users.id, integrationOpenapiSpecs.createdByUserId)).where(eq(integrationOpenapiSpecs.id, specId)).limit(1))[0];
  if (!spec?.spec.simulationOnly) throw new Error("Especificação OpenAPI simulada não encontrada.");
  const operations = await db.select().from(integrationOpenapiOperations).where(eq(integrationOpenapiOperations.specId, specId)).orderBy(integrationOpenapiOperations.path, integrationOpenapiOperations.method);
  return { ...spec, operations };
}

export async function importSimulatedOpenapiSpec(input: { document: string; format: "auto" | "json" | "yaml"; actorUserId: number }) {
  const parsed = parseOpenapiDocument(input.document, input.format);
  const db = await requireDb();
  return db.transaction(async tx => {
    const [created] = await tx.insert(integrationOpenapiSpecs).values({ name: parsed.name, apiVersion: parsed.apiVersion, openapiVersion: parsed.openapiVersion, description: parsed.description, sourceType: "importado", importFormat: parsed.importFormat, document: parsed.document, operationCount: parsed.operations.length, simulationOnly: true, createdByUserId: input.actorUserId }).$returningId();
    await tx.insert(integrationOpenapiOperations).values(parsed.operations.map(operation => ({ specId: created.id, operationKey: operation.operationKey, method: operation.method, path: operation.path, summary: operation.summary, description: operation.description, tags: operation.tags, parameters: operation.parameters, requestBody: operation.requestBody, responses: operation.responses, security: operation.security, simulationOnly: true })));
    await tx.insert(auditLogs).values(integrationAudit({ resourceType: "openapi_spec", resourceId: created.id, actorUserId: input.actorUserId, action: "import_simulation", beforeData: null, afterData: { name: parsed.name, apiVersion: parsed.apiVersion, openapiVersion: parsed.openapiVersion, importFormat: parsed.importFormat, operationCount: parsed.operations.length, simulationOnly: true, externalRequests: 0 } }));
    return { specId: created.id, operationCount: parsed.operations.length };
  });
}

export async function generateSimulatedConnectorFromOpenapiOperation(input: { operationId: number; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const operation = (await tx.select().from(integrationOpenapiOperations).where(eq(integrationOpenapiOperations.id, input.operationId)).limit(1))[0];
    if (!operation?.simulationOnly) throw new Error("Operação OpenAPI simulada não encontrada.");
    if (operation.generatedConnectionId) return { connectionId: operation.generatedConnectionId, created: false };
    const spec = (await tx.select().from(integrationOpenapiSpecs).where(eq(integrationOpenapiSpecs.id, operation.specId)).limit(1))[0];
    if (!spec?.simulationOnly) throw new Error("Especificação OpenAPI simulada não encontrada.");
    const code = normalizeIntegrationCode(`openapi-${operation.specId}-${operation.operationKey}`).slice(0, 100);
    const [connection] = await tx.insert(integrationConnections).values({ code, name: `${spec.name} — ${operation.summary || operation.operationKey}`.slice(0, 180), description: `Conector gerado da operação ${operation.method} ${operation.path} em SIMULAÇÃO / MOCK.`, connectionType: "openapi_simulado", environment: "simulacao", baseUrl: null, active: false, simulationOnly: true, configuration: { mode: "SIMULAÇÃO / MOCK", delivery: "desativada", source: "openapi_import", specId: spec.id, operationId: operation.id, operationKey: operation.operationKey, method: operation.method, path: operation.path, parameters: operation.parameters, requestBody: operation.requestBody, responses: operation.responses, externalRequests: 0 }, createdByUserId: input.actorUserId, updatedByUserId: input.actorUserId }).$returningId();
    await tx.update(integrationOpenapiOperations).set({ generatedConnectionId: connection.id }).where(eq(integrationOpenapiOperations.id, operation.id));
    await tx.insert(auditLogs).values([
      integrationAudit({ resourceType: "integration_connection", resourceId: connection.id, actorUserId: input.actorUserId, action: "generate_from_openapi_simulation", beforeData: null, afterData: { code, operationId: operation.id, specId: spec.id, active: false, simulationOnly: true, externalRequests: 0 } }),
      integrationAudit({ resourceType: "openapi_operation", resourceId: operation.id, actorUserId: input.actorUserId, action: "generate_connector_simulation", beforeData: { generatedConnectionId: null }, afterData: { generatedConnectionId: connection.id, simulationOnly: true } }),
    ]);
    return { connectionId: connection.id, created: true };
  });
}

export async function simulateOpenapiOperationTest(input: { operationId: number; actorUserId: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const operation = (await tx.select().from(integrationOpenapiOperations).where(eq(integrationOpenapiOperations.id, input.operationId)).limit(1))[0];
    if (!operation?.simulationOnly) throw new Error("Operação OpenAPI simulada não encontrada.");
    const response = { mode: "SIMULAÇÃO / MOCK", delivered: false, externalRequests: 0, message: "Teste de contrato concluído sem enviar requisição externa." };
    await tx.insert(integrationLogs).values({ level: "info", source: "openapi.docs.simulacao", message: `Teste simulado de contrato ${operation.method} ${operation.path} concluído sem chamada externa.`, endpoint: `${operation.method} ${operation.path}`, requestData: { operationId: operation.id, simulationOnly: true, externalRequests: 0 }, responseData: response, httpStatus: 202, durationMs: 0, retryAttempt: 0 });
    await tx.insert(auditLogs).values(integrationAudit({ resourceType: "openapi_operation", resourceId: operation.id, actorUserId: input.actorUserId, action: "tryout_simulation", beforeData: null, afterData: { endpoint: `${operation.method} ${operation.path}`, httpStatus: 202, simulationOnly: true, externalRequests: 0 } }));
    return { status: 202, durationMs: 0, response };
  });
}
