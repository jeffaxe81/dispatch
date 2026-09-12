import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { INCIDENT_PRIORITIES, INCIDENT_STATUSES, INCIDENT_TRANSITIONS } from "../shared/operations";
import { assertCanAddIncidentEvidence, assertCanEditIncident, assertCanReadIncident, assertCanTransitionIncident, assertOwnTeam } from "./authorization";
import { assertPermission, assertSuperAdministrator, assertTeamScope, resolveAuthorizedTeamFilter } from "./accessControl";
import { protectedProcedure, router } from "./_core/trpc";
import {
  addIncidentEvidence,
  assignTeamToIncident,
  auditOperationalReportExport,
  getIncidentAudit,
  getIncidentTimeline,
  listIncidentEvidence,
  permanentlyDeleteIncident,
  recordTeamLocation,
  respondToAssignment,
  transitionIncident,
  updateIncident,
  updateTeamShift,
  updateTeamStatus,
  updateVehicleStatus,
} from "./db";
import { rankTeamCandidates } from "./gisService";
import { OsrmRouteProvider } from "./routingProvider";
import { appRouter } from "./routers";
import {
  assertTeamTenant,
  assertVehicleTenant,
  createIncidentForTenant,
  createTeamForTenant,
  createVehicleForTenant,
  getDashboardDataForTenant,
  getIncidentForTenant,
  getOperationalReportForTenant,
  getTenantSelection,
  listIncidentsForTenant,
  listTeamsForTenant,
  listVehiclesForTenant,
  requireActiveTenant,
} from "./tenantOperational";

const statusEnum = z.enum(INCIDENT_STATUSES);
const priorityEnum = z.enum(INCIDENT_PRIORITIES);
const originEnum = z.enum(["central", "telefone", "chat", "video", "sensor", "agente", "integracao"]);
const paginationInput = z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) });
const reportFiltersInput = z.object({ startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(), teamId: z.number().int().positive().optional() });

const operationalProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user?.active) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireIncident(result: Awaited<ReturnType<typeof getIncidentForTenant>>) {
  if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Ocorrência não encontrada neste tenant." });
  return result.incident;
}

async function tenantFor(ctx: { user: Parameters<typeof requireActiveTenant>[0]; req: Parameters<typeof requireActiveTenant>[1] }) {
  return requireActiveTenant(ctx.user, ctx.req);
}

const tenantOverrides = router({
  tenant: router({
    selection: operationalProcedure.query(({ ctx }) => getTenantSelection(ctx.user, ctx.req)),
  }),
  dashboard: router({
    summary: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "occurrences.view");
      const tenantId = await tenantFor(ctx);
      const teamId = ctx.user.operationalRole === "agente" ? ctx.user.teamId ?? -1 : undefined;
      return getDashboardDataForTenant(tenantId, teamId);
    }),
  }),
  reports: router({
    overview: operationalProcedure.input(reportFiltersInput).query(async ({ ctx, input }) => {
      const tenantId = await tenantFor(ctx);
      const teamId = await resolveAuthorizedTeamFilter(ctx.user, input.teamId, "reports.view");
      if (teamId) await assertTeamTenant(tenantId, teamId);
      return getOperationalReportForTenant(tenantId, { ...input, teamId });
    }),
    export: operationalProcedure.input(reportFiltersInput.extend({ format: z.enum(["csv", "pdf"]) })).mutation(async ({ ctx, input }) => {
      const tenantId = await tenantFor(ctx);
      const teamId = await resolveAuthorizedTeamFilter(ctx.user, input.teamId, "reports.export");
      if (teamId) await assertTeamTenant(tenantId, teamId);
      const report = await getOperationalReportForTenant(tenantId, { startDate: input.startDate, endDate: input.endDate, teamId });
      await auditOperationalReportExport({ actorUserId: ctx.user.id, format: input.format, report });
      return { success: true, generatedAt: report.generatedAt };
    }),
    savedFilters: router({
      save: operationalProcedure.input(reportFiltersInput.extend({ name: z.string().trim().min(2).max(120), isDefault: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "reports.view");
        const tenantId = await tenantFor(ctx);
        if (input.teamId) {
          await assertTeamTenant(tenantId, input.teamId);
          await assertTeamScope(ctx.user, input.teamId, "reports.view", tenantId);
        }
        const { saveDashboardFilter } = await import("./db");
        return saveDashboardFilter({ userId: ctx.user.id, ...input });
      }),
    }),
  }),
  incidents: router({
    list: operationalProcedure
      .input(paginationInput.extend({ search: z.string().trim().max(120).optional(), status: statusEnum.optional(), priority: priorityEnum.optional(), teamId: z.number().int().positive().optional() }))
      .query(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "occurrences.view");
        const tenantId = await tenantFor(ctx);
        const teamId = ctx.user.operationalRole === "agente" ? ctx.user.teamId ?? -1 : input.teamId;
        if (teamId && teamId > 0) await assertTeamTenant(tenantId, teamId);
        return listIncidentsForTenant(tenantId, { ...input, teamId });
      }),
    get: operationalProcedure.input(z.object({ incidentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const tenantId = await tenantFor(ctx);
      const result = await getIncidentForTenant(tenantId, input.incidentId);
      const incident = requireIncident(result);
      await assertPermission(ctx.user, "occurrences.view");
      if (incident.assignedTeamId) await assertTeamScope(ctx.user, incident.assignedTeamId, "occurrences.view", tenantId);
      assertCanReadIncident(ctx.user, incident);
      return result;
    }),
    create: operationalProcedure
      .input(z.object({
        category: z.string().trim().min(3).max(160),
        priority: priorityEnum,
        origin: originEnum,
        requesterName: z.string().trim().max(200).optional(),
        requesterContact: z.string().trim().max(80).optional(),
        description: z.string().trim().min(5).max(5000),
        address: z.string().trim().min(5).max(500),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "occurrences.create");
        const tenantId = await tenantFor(ctx);
        return createIncidentForTenant(tenantId, { ...input, actorUserId: ctx.user.id });
      }),
    update: operationalProcedure
      .input(z.object({
        incidentId: z.number().int().positive(),
        category: z.string().trim().min(3).max(160).optional(),
        priority: priorityEnum.optional(),
        requesterName: z.string().trim().max(200).nullable().optional(),
        requesterContact: z.string().trim().max(80).nullable().optional(),
        description: z.string().trim().min(5).max(5000).optional(),
        address: z.string().trim().min(5).max(500).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "occurrences.edit");
        const tenantId = await tenantFor(ctx);
        assertCanEditIncident(ctx.user, requireIncident(await getIncidentForTenant(tenantId, input.incidentId)));
        return updateIncident({ ...input, actorUserId: ctx.user.id });
      }),
    permanentlyDelete: operationalProcedure
      .input(z.object({ incidentId: z.number().int().positive(), reason: z.string().trim().min(10).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        await assertSuperAdministrator(ctx.user);
        const tenantId = await tenantFor(ctx);
        requireIncident(await getIncidentForTenant(tenantId, input.incidentId));
        return permanentlyDeleteIncident({ ...input, actorUserId: ctx.user.id });
      }),
    transition: operationalProcedure
      .input(z.object({ incidentId: z.number().int().positive(), nextStatus: statusEnum, note: z.string().trim().min(3).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = await tenantFor(ctx);
        const incident = requireIncident(await getIncidentForTenant(tenantId, input.incidentId));
        const permission = input.nextStatus === "concluida" ? "occurrences.close" : "occurrences.transition";
        await assertPermission(ctx.user, permission);
        if (incident.assignedTeamId) await assertTeamScope(ctx.user, incident.assignedTeamId, permission, tenantId);
        if (!INCIDENT_TRANSITIONS[incident.status].includes(input.nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "Transição de status inválida." });
        assertCanTransitionIncident(ctx.user, incident, input.nextStatus);
        return transitionIncident({ ...input, actorUserId: ctx.user.id });
      }),
    assign: operationalProcedure
      .input(z.object({ incidentId: z.number().int().positive(), teamId: z.number().int().positive(), vehicleId: z.number().int().positive().optional(), estimatedArrivalMinutes: z.number().int().min(1).max(720).optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "dispatch.create");
        const tenantId = await tenantFor(ctx);
        const incident = requireIncident(await getIncidentForTenant(tenantId, input.incidentId));
        await assertTeamTenant(tenantId, input.teamId);
        await assertTeamScope(ctx.user, input.teamId, "dispatch.create", tenantId);
        if (input.vehicleId) await assertVehicleTenant(tenantId, input.vehicleId);
        if (!(incident.status === "triagem" || incident.status === "aguardando_despacho")) throw new TRPCError({ code: "BAD_REQUEST", message: "A ocorrência não está disponível para despacho." });
        return assignTeamToIncident({ ...input, actorUserId: ctx.user.id });
      }),
    respondToAssignment: operationalProcedure
      .input(z.object({ incidentId: z.number().int().positive(), accepted: z.boolean(), note: z.string().trim().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.teamId) throw new TRPCError({ code: "FORBIDDEN", message: "Agente sem equipe vinculada." });
        const tenantId = await tenantFor(ctx);
        await assertTeamTenant(tenantId, ctx.user.teamId);
        await assertTeamScope(ctx.user, ctx.user.teamId, "occurrences.transition", tenantId);
        assertOwnTeam(ctx.user, ctx.user.teamId);
        assertCanReadIncident(ctx.user, requireIncident(await getIncidentForTenant(tenantId, input.incidentId)));
        return respondToAssignment({ ...input, teamId: ctx.user.teamId, actorUserId: ctx.user.id });
      }),
    evidence: router({
      list: operationalProcedure.input(z.object({ incidentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
        const tenantId = await tenantFor(ctx);
        const incident = requireIncident(await getIncidentForTenant(tenantId, input.incidentId));
        await assertPermission(ctx.user, "occurrences.view");
        if (incident.assignedTeamId) await assertTeamScope(ctx.user, incident.assignedTeamId, "occurrences.view", tenantId);
        assertCanReadIncident(ctx.user, incident);
        return listIncidentEvidence(input.incidentId);
      }),
      upload: operationalProcedure.input(z.object({ incidentId: z.number().int().positive(), fileName: z.string().trim().min(1).max(255), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), description: z.string().trim().max(1000).nullable().optional(), dataBase64: z.string().min(4).max(11_200_000) })).mutation(async ({ ctx, input }) => {
        if (!ctx.user.teamId) throw new TRPCError({ code: "FORBIDDEN", message: "Agente sem equipe vinculada." });
        await assertPermission(ctx.user, "occurrences.view");
        const tenantId = await tenantFor(ctx);
        const incident = requireIncident(await getIncidentForTenant(tenantId, input.incidentId));
        await assertTeamTenant(tenantId, ctx.user.teamId);
        await assertTeamScope(ctx.user, ctx.user.teamId, "occurrences.view", tenantId);
        assertCanAddIncidentEvidence(ctx.user, incident);
        return addIncidentEvidence({ ...input, teamId: ctx.user.teamId, actorUserId: ctx.user.id });
      }),
    }),
    timeline: operationalProcedure.input(z.object({ incidentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const tenantId = await tenantFor(ctx);
      const incident = requireIncident(await getIncidentForTenant(tenantId, input.incidentId));
      await assertPermission(ctx.user, "occurrences.view");
      if (incident.assignedTeamId) await assertTeamScope(ctx.user, incident.assignedTeamId, "occurrences.view", tenantId);
      assertCanReadIncident(ctx.user, incident);
      return getIncidentTimeline(input.incidentId);
    }),
    audit: operationalProcedure.input(z.object({ incidentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "audit.view");
      const tenantId = await tenantFor(ctx);
      requireIncident(await getIncidentForTenant(tenantId, input.incidentId));
      return getIncidentAudit(input.incidentId);
    }),
    export: operationalProcedure
      .input(z.object({ search: z.string().trim().max(120).optional(), status: statusEnum.optional(), priority: priorityEnum.optional(), teamId: z.number().int().positive().optional() }))
      .query(async ({ ctx, input }) => {
        const tenantId = await tenantFor(ctx);
        const teamId = await resolveAuthorizedTeamFilter(ctx.user, input.teamId, "reports.export");
        if (teamId) await assertTeamTenant(tenantId, teamId);
        const result = await listIncidentsForTenant(tenantId, { ...input, teamId, page: 1, pageSize: 100 });
        return result.rows.map(({ incident, teamCode }) => ({ codigo: incident.code, situacao: incident.status, prioridade: incident.priority, tipificacao: incident.category, endereco: incident.address, equipe: teamCode ?? "", criadoEm: incident.createdAt.toISOString() }));
      }),
  }),
  teams: router({
    list: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "teams.view");
      const tenantId = await tenantFor(ctx);
      const teamId = ctx.user.operationalRole === "agente" ? ctx.user.teamId ?? -1 : undefined;
      if (teamId && teamId > 0) await assertTeamTenant(tenantId, teamId);
      return listTeamsForTenant(tenantId, teamId);
    }),
    create: operationalProcedure
      .input(z.object({ code: z.string().trim().min(2).max(32), name: z.string().trim().min(3).max(160), agency: z.string().trim().min(3).max(160), organizationId: z.number().int().positive().nullable().optional(), organizationalUnitId: z.number().int().positive().nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "teams.manage");
        const tenantId = await tenantFor(ctx);
        return createTeamForTenant(tenantId, { ...input, actorUserId: ctx.user.id });
      }),
    updateStatus: operationalProcedure.input(z.object({ teamId: z.number().int().positive(), status: z.enum(["disponivel", "em_deslocamento", "em_atendimento", "pausada", "indisponivel"]) })).mutation(async ({ ctx, input }) => {
      const tenantId = await tenantFor(ctx);
      await assertTeamTenant(tenantId, input.teamId);
      await assertTeamScope(ctx.user, input.teamId, "teams.manage", tenantId);
      if (ctx.user.operationalRole === "agente") assertOwnTeam(ctx.user, input.teamId);
      await updateTeamStatus({ ...input, actorUserId: ctx.user.id });
      return { success: true };
    }),
    updateShift: operationalProcedure.input(z.object({ teamId: z.number().int().positive(), action: z.enum(["start", "pause", "resume", "end"]) })).mutation(async ({ ctx, input }) => {
      const tenantId = await tenantFor(ctx);
      await assertTeamTenant(tenantId, input.teamId);
      await assertTeamScope(ctx.user, input.teamId, "teams.manage", tenantId);
      if (ctx.user.operationalRole === "agente") assertOwnTeam(ctx.user, input.teamId);
      await updateTeamShift({ ...input, actorUserId: ctx.user.id });
      return { success: true };
    }),
    recordLocation: operationalProcedure.input(z.object({ teamId: z.number().int().positive(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracyMeters: z.number().min(0).max(10000).optional(), speedMetersPerSecond: z.number().min(0).max(150).optional(), headingDegrees: z.number().min(0).max(360).optional(), capturedAt: z.date() })).mutation(async ({ ctx, input }) => {
      const tenantId = await tenantFor(ctx);
      await assertTeamTenant(tenantId, input.teamId);
      await assertTeamScope(ctx.user, input.teamId, "occurrences.transition", tenantId);
      assertOwnTeam(ctx.user, input.teamId);
      await recordTeamLocation({ ...input, userId: ctx.user.id });
      return { success: true };
    }),
  }),
  vehicles: router({
    list: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "vehicles.view");
      return listVehiclesForTenant(await tenantFor(ctx));
    }),
    create: operationalProcedure.input(z.object({ prefix: z.string().trim().min(2).max(32), licensePlate: z.string().trim().min(5).max(16), model: z.string().trim().max(120).optional(), type: z.string().trim().min(2).max(80), teamId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "vehicles.manage");
      const tenantId = await tenantFor(ctx);
      return createVehicleForTenant(tenantId, { ...input, actorUserId: ctx.user.id });
    }),
    updateStatus: operationalProcedure.input(z.object({ vehicleId: z.number().int().positive(), status: z.enum(["operacional", "manutencao", "indisponivel"]) })).mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "vehicles.manage");
      const tenantId = await tenantFor(ctx);
      await assertVehicleTenant(tenantId, input.vehicleId);
      await updateVehicleStatus({ ...input, actorUserId: ctx.user.id });
      return { success: true };
    }),
  }),
  gis: router({
    rankCandidates: operationalProcedure.input(z.object({
      incident: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
      candidates: z.array(z.object({ teamId: z.number().int().positive(), code: z.string().trim().min(1).max(32), name: z.string().trim().min(1).max(160), status: z.string().trim().min(1).max(64), position: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }) })).max(50),
      maxRouteCandidates: z.number().int().min(1).max(10).default(3),
    })).query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "occurrences.view");
      const tenantId = await tenantFor(ctx);
      for (const candidate of input.candidates) {
        await assertTeamTenant(tenantId, candidate.teamId);
        await assertTeamScope(ctx.user, candidate.teamId, "teams.view", tenantId);
      }
      return rankTeamCandidates(input.incident, input.candidates, new OsrmRouteProvider(), input.maxRouteCandidates);
    }),
  }),
});

function nestedRecordFromProcedures(procedures: Record<string, unknown>) {
  const record: Record<string, unknown> = {};
  for (const [path, procedure] of Object.entries(procedures)) {
    const parts = path.split(".");
    let cursor: Record<string, unknown> = record;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      const existing = cursor[part];
      if (!existing || typeof existing !== "object") cursor[part] = {};
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts.at(-1)!] = procedure;
  }
  return record;
}

const baseProcedures = (appRouter as any)._def.procedures as Record<string, unknown>;
const overrideProcedures = (tenantOverrides as any)._def.procedures as Record<string, unknown>;

export const tenantAwareAppRouter = router(nestedRecordFromProcedures({ ...baseProcedures, ...overrideProcedures }) as any);
