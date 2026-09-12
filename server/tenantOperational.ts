import { and, count, desc, eq, gte, inArray, isNotNull, like, lte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { incidentTenantScopes, vehicleTenantScopes } from "../drizzle/tenantScopeSchema";
import { incidents, organizations, teams, users, vehicles, type User } from "../drizzle/schema";
import type { IncidentPriority, IncidentStatus } from "../shared/operations";
import { ENV } from "./_core/env";
import { getAccessSnapshot } from "./accessControl";
import { createIncident, createTeam, createVehicle, getDb, type IncidentListInput, type OperationalReportInput } from "./db";

type CurrentUser = Pick<User, "id" | "openId" | "role" | "operationalRole" | "teamId" | "active">;
type HeaderRequest = { headers?: Record<string, string | string[] | undefined> };

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

function parseTenantHeader(req: HeaderRequest) {
  const raw = req.headers?.["x-organization-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  if (!/^\d+$/.test(value)) throw new TRPCError({ code: "BAD_REQUEST", message: "Identificador da empresa ativa é inválido." });
  const tenantId = Number(value);
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Identificador da empresa ativa é inválido." });
  return tenantId;
}

export async function listAuthorizedTenants(user: CurrentUser) {
  const db = await requireDb();
  const snapshot = await getAccessSnapshot(user.id);
  const globalAccess = user.role === "admin" || user.openId === ENV.ownerOpenId || snapshot.assignments.some(assignment => assignment.defaultScope === "global");
  if (globalAccess) {
    return db.select({ id: organizations.id, code: organizations.code, name: organizations.name }).from(organizations).where(eq(organizations.active, true)).orderBy(organizations.name);
  }

  const ids = new Set<number>();
  for (const assignment of snapshot.assignments) if (assignment.organizationId) ids.add(assignment.organizationId);
  if (user.teamId) {
    const team = (await db.select({ organizationId: teams.organizationId }).from(teams).where(eq(teams.id, user.teamId)).limit(1))[0];
    if (team?.organizationId) ids.add(team.organizationId);
  }
  if (!ids.size) return [];
  return db.select({ id: organizations.id, code: organizations.code, name: organizations.name }).from(organizations).where(and(eq(organizations.active, true), inArray(organizations.id, Array.from(ids)))).orderBy(organizations.name);
}

export async function requireActiveTenant(user: CurrentUser, req: HeaderRequest) {
  if (!user.active) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
  const tenants = await listAuthorizedTenants(user);
  const selected = parseTenantHeader(req);
  if (selected !== null) {
    if (!tenants.some(tenant => tenant.id === selected)) throw new TRPCError({ code: "FORBIDDEN", message: "A empresa selecionada não está autorizada para este usuário." });
    return selected;
  }
  if (tenants.length === 1) return tenants[0].id;
  if (tenants.length > 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a empresa ativa para continuar." });
  throw new TRPCError({ code: "FORBIDDEN", message: "O usuário não possui empresa autorizada para o escopo operacional." });
}

export async function getTenantSelection(user: CurrentUser, req: HeaderRequest) {
  const tenants = await listAuthorizedTenants(user);
  const requested = parseTenantHeader(req);
  return {
    organizations: tenants,
    activeOrganizationId: requested && tenants.some(tenant => tenant.id === requested) ? requested : tenants.length === 1 ? tenants[0].id : null,
    requiresSelection: tenants.length > 1 && !(requested && tenants.some(tenant => tenant.id === requested)),
  };
}

export async function assertTeamTenant(tenantId: number, teamId: number) {
  const db = await requireDb();
  const team = (await db.select({ id: teams.id, organizationId: teams.organizationId }).from(teams).where(eq(teams.id, teamId)).limit(1))[0];
  if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Equipe não encontrada." });
  if (team.organizationId !== tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A equipe pertence a outra empresa." });
  return team;
}

export async function assertVehicleTenant(tenantId: number, vehicleId: number) {
  const db = await requireDb();
  const row = (await db.select({ vehicleId: vehicleTenantScopes.vehicleId }).from(vehicleTenantScopes).where(and(eq(vehicleTenantScopes.vehicleId, vehicleId), eq(vehicleTenantScopes.organizationId, tenantId))).limit(1))[0];
  if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "A viatura pertence a outra empresa ou ainda não possui tenant mapeado." });
}

export async function listIncidentsForTenant(tenantId: number, input: IncidentListInput) {
  const db = await requireDb();
  const filters = [eq(incidentTenantScopes.organizationId, tenantId)];
  if (input.search) {
    const query = `%${input.search.trim()}%`;
    filters.push(or(like(incidents.code, query), like(incidents.category, query), like(incidents.address, query))!);
  }
  if (input.status) filters.push(eq(incidents.status, input.status));
  if (input.priority) filters.push(eq(incidents.priority, input.priority));
  if (input.teamId) filters.push(eq(incidents.assignedTeamId, input.teamId));
  const where = and(...filters);
  const [rows, totalRows] = await Promise.all([
    db.select({ incident: incidents, teamCode: teams.code, teamName: teams.name, vehiclePrefix: vehicles.prefix })
      .from(incidents)
      .innerJoin(incidentTenantScopes, eq(incidentTenantScopes.incidentId, incidents.id))
      .leftJoin(teams, eq(incidents.assignedTeamId, teams.id))
      .leftJoin(vehicles, eq(incidents.assignedVehicleId, vehicles.id))
      .where(where)
      .orderBy(desc(incidents.createdAt))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(incidents).innerJoin(incidentTenantScopes, eq(incidentTenantScopes.incidentId, incidents.id)).where(where),
  ]);
  return { rows, total: Number(totalRows[0]?.total ?? 0) };
}

export async function getIncidentForTenant(tenantId: number, incidentId: number) {
  const db = await requireDb();
  return (await db.select({ incident: incidents, teamCode: teams.code, teamName: teams.name, vehiclePrefix: vehicles.prefix })
    .from(incidents)
    .innerJoin(incidentTenantScopes, eq(incidentTenantScopes.incidentId, incidents.id))
    .leftJoin(teams, eq(incidents.assignedTeamId, teams.id))
    .leftJoin(vehicles, eq(incidents.assignedVehicleId, vehicles.id))
    .where(and(eq(incidents.id, incidentId), eq(incidentTenantScopes.organizationId, tenantId)))
    .limit(1))[0];
}

export async function createIncidentForTenant(tenantId: number, input: Parameters<typeof createIncident>[0]) {
  const created = await createIncident(input);
  const db = await requireDb();
  await db.insert(incidentTenantScopes).values({ incidentId: created.id, organizationId: tenantId });
  return created;
}

export async function listTeamsForTenant(tenantId: number, teamId?: number) {
  const db = await requireDb();
  const where = teamId
    ? and(eq(teams.active, true), eq(teams.organizationId, tenantId), eq(teams.id, teamId))
    : and(eq(teams.active, true), eq(teams.organizationId, tenantId));
  return db.select({ team: teams, vehiclePrefix: vehicles.prefix, vehicleType: vehicles.type, vehicleStatus: vehicles.status })
    .from(teams).leftJoin(vehicles, eq(vehicles.teamId, teams.id)).where(where).orderBy(teams.code);
}

export async function createTeamForTenant(tenantId: number, input: Omit<Parameters<typeof createTeam>[0], "organizationId"> & { organizationId?: number | null }) {
  if (input.organizationId && input.organizationId !== tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Não é permitido criar equipe em outra empresa." });
  return createTeam({ ...input, organizationId: tenantId });
}

export async function listVehiclesForTenant(tenantId: number) {
  const db = await requireDb();
  return db.select({ vehicle: vehicles, teamCode: teams.code, teamName: teams.name })
    .from(vehicles)
    .innerJoin(vehicleTenantScopes, eq(vehicleTenantScopes.vehicleId, vehicles.id))
    .leftJoin(teams, eq(vehicles.teamId, teams.id))
    .where(eq(vehicleTenantScopes.organizationId, tenantId))
    .orderBy(vehicles.prefix);
}

export async function createVehicleForTenant(tenantId: number, input: Parameters<typeof createVehicle>[0]) {
  if (input.teamId) await assertTeamTenant(tenantId, input.teamId);
  const created = await createVehicle(input);
  const db = await requireDb();
  await db.insert(vehicleTenantScopes).values({ vehicleId: created.id, organizationId: tenantId });
  return created;
}

export async function getDashboardDataForTenant(tenantId: number, teamId?: number) {
  const db = await requireDb();
  if (teamId) await assertTeamTenant(tenantId, teamId);
  const activeStatuses: IncidentStatus[] = ["triagem", "aguardando_despacho", "despachada", "aceita", "em_atendimento", "pausada"];
  const incidentScope = teamId
    ? and(eq(incidentTenantScopes.organizationId, tenantId), inArray(incidents.status, activeStatuses), eq(incidents.assignedTeamId, teamId))
    : and(eq(incidentTenantScopes.organizationId, tenantId), inArray(incidents.status, activeStatuses));
  const acceptedScope = teamId
    ? and(eq(incidentTenantScopes.organizationId, tenantId), isNotNull(incidents.acceptedAt), eq(incidents.assignedTeamId, teamId))
    : and(eq(incidentTenantScopes.organizationId, tenantId), isNotNull(incidents.acceptedAt));
  const availabilityScope = teamId
    ? and(eq(teams.active, true), eq(teams.status, "disponivel"), eq(teams.organizationId, tenantId), eq(teams.id, teamId))
    : and(eq(teams.active, true), eq(teams.status, "disponivel"), eq(teams.organizationId, tenantId));
  const scopedIncidents = db.select({ incident: incidents }).from(incidents).innerJoin(incidentTenantScopes, eq(incidentTenantScopes.incidentId, incidents.id));
  const [activeRows, availableRows, acceptedRows, queueRows] = await Promise.all([
    db.select({ total: count() }).from(incidents).innerJoin(incidentTenantScopes, eq(incidentTenantScopes.incidentId, incidents.id)).where(incidentScope),
    db.select({ total: count() }).from(teams).where(availabilityScope),
    db.select({ createdAt: incidents.createdAt, acceptedAt: incidents.acceptedAt }).from(incidents).innerJoin(incidentTenantScopes, eq(incidentTenantScopes.incidentId, incidents.id)).where(acceptedScope).limit(250),
    scopedIncidents.where(incidentScope).orderBy(desc(incidents.createdAt)).limit(24),
  ]);
  const averageResponseSeconds = acceptedRows.length ? Math.round(acceptedRows.reduce((total, row) => total + (row.acceptedAt!.getTime() - row.createdAt.getTime()) / 1000, 0) / acceptedRows.length) : null;
  const weight: Record<IncidentPriority, number> = { critica: 4, alta: 3, media: 2, baixa: 1 };
  return {
    activeIncidents: Number(activeRows[0]?.total ?? 0),
    availableTeams: Number(availableRows[0]?.total ?? 0),
    averageResponseSeconds,
    priorityQueue: queueRows.map(row => row.incident).sort((a, b) => weight[b.priority] - weight[a.priority] || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 8),
  };
}

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

export async function getOperationalReportForTenant(tenantId: number, input: OperationalReportInput) {
  if (input.startDate && input.endDate && input.startDate > input.endDate) throw new Error("O período inicial não pode ser posterior ao período final.");
  if (input.teamId) await assertTeamTenant(tenantId, input.teamId);
  const db = await requireDb();
  const loadRows = async (range: OperationalReportInput): Promise<OperationalReportRow[]> => {
    const filters = [eq(incidentTenantScopes.organizationId, tenantId)];
    if (range.startDate) filters.push(gte(incidents.createdAt, range.startDate));
    if (range.endDate) filters.push(lte(incidents.createdAt, range.endDate));
    if (range.teamId) filters.push(eq(incidents.assignedTeamId, range.teamId));
    return db.select({ incident: incidents, teamCode: teams.code, teamName: teams.name })
      .from(incidents)
      .innerJoin(incidentTenantScopes, eq(incidentTenantScopes.incidentId, incidents.id))
      .leftJoin(teams, eq(incidents.assignedTeamId, teams.id))
      .where(and(...filters)).orderBy(desc(incidents.createdAt));
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
