import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { INCIDENT_PRIORITIES, INCIDENT_STATUSES, INCIDENT_TRANSITIONS, OPERATIONAL_ROLES } from "../shared/operations";
import {
  assertCanEditIncident,
  assertCanAddIncidentEvidence,
  assertCanReadIncident,
  assertCanTransitionIncident,
  assertOperation,
  assertOwnTeam,
} from "./authorization";
import { assertIntegrationApprovalAdministrator, assertPermission, assertSuperAdministrator, assertTeamScope, getEffectiveAccess, resolveAuthorizedTeamFilter } from "./accessControl";
import { listAccessPermissionGlossary } from "./accessCatalog";
import { getSessionCookieOptions } from "./_core/cookies";
import { createLocalSessionToken, hashLocalPassword, loginWithLocalCredentials, normalizeUsername } from "./localAuth";
import { systemRouter } from "./_core/systemRouter";
import { getSimulatedIntegrationsOverview } from "./integrations";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  assignTeamToIncident,
  addIncidentEvidence,
  assignUserRole,
  createManualUser,
  setUserLocalCredentials,
  createAccessRole,
  createAccessPermission,
  createOrganization,
  createOrganizationalUnit,
  createSimulatedWorkflow,
  confirmExternalIncidentReview,
  activateAlrtHomologationConnection,
  approveAlrtProductionReadiness,
  createSimulatedIntegrationConnection,
  createSimulatedIntegrationCredential,
  createSimulatedIntegrationWebhook,
  deleteSimulatedWorkflow,
  deleteSimulatedIntegrationConnection,
  deleteSimulatedIntegrationCredential,
  deleteSimulatedIntegrationWebhook,
  executeSimulatedWorkflow,
  getSimulatedWorkflow,
  getSimulatedWorkflowExecution,
  updateOrganization,
  updateOrganizationalUnit,
  createTeam,
  createVehicle,
  createIncident,
  permanentlyDeleteIncident,
  getOperationalMapSettings,
  getOwnProfilePhoto,
  getSolutionResetPreview,
  getSimulatedIntegrationMetrics,
  getImportedOpenapiSpec,
  generateSimulatedConnectorFromOpenapiOperation,
  importSimulatedOpenapiSpec,
  listFutureGeneralSettingEntries,
  listOperationLogs,
  getDashboardData,
  getOperationalReport,
  auditOperationalReportExport,
  listDashboardSavedFilters,
  saveDashboardFilter,
  deleteDashboardFilter,
  listHelpFavorites,
  addHelpFavorite,
  removeHelpFavorite,
  listOwnFaqSuggestions,
  createFaqSuggestion,
  getIncidentAudit,
  getIncidentById,
  getIncidentTimeline,
  listIncidents,
  listIncidentEvidence,
  listAccessPermissions,
  listAccessRoles,
  listIntegrationEventCatalog,
  listAlrtIngressTestLog,
  listImportedOpenapiSpecs,
  listExternalIncidentReviews,
  listSanitizedIntegrationLogs,
  listSimulatedIntegrationConnections,
  listSimulatedIntegrationCredentials,
  listSimulatedIntegrationWebhooks,
  listSimulatedWorkflowExecutions,
  listOrganizationsAndUnits,
  listSimulatedWorkflows,
  listTeams,
  listUsersWithAccess,
  listVehicles,
  listUsersForAdministration,
  recordTeamLocation,
  respondToAssignment,
  transitionIncident,
  updateAccessRole,
  updateIncident,
  updateOperationalUser,
  updateUserProfileAccess,
  uploadUserProfilePhoto,
  setUserRoleAssignmentActive,
  setSimulatedWorkflowActive,
  retrySimulatedWorkflowExecution,
  simulateOpenapiOperationTest,
  updateTeamShift,
  updateTeamStatus,
  updateGeneralMapSettings,
  resetSolutionOperationalData,
  updateSimulatedWorkflow,
  updateSimulatedIntegrationConnection,
  updateVehicleStatus,
} from "./db";
import { getInternalOpenapiCatalog } from "./openapi";

const roleEnum = z.enum(OPERATIONAL_ROLES);
const statusEnum = z.enum(INCIDENT_STATUSES);
const priorityEnum = z.enum(INCIDENT_PRIORITIES);
const originEnum = z.enum(["central", "telefone", "chat", "video", "sensor", "agente", "integracao"]);
const paginationInput = z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) });
const accessScopeEnum = z.enum(["global", "organizacao", "unidade", "departamento", "grupo", "equipe"]);
const reportFiltersInput = z.object({ startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(), teamId: z.number().int().positive().optional() });

const operationalProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user?.active) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireIncident(result: Awaited<ReturnType<typeof getIncidentById>>) {
  if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Ocorrência não encontrada." });
  return result.incident;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure.input(z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(12).max(256) })).mutation(async ({ ctx, input }) => {
      const user = await loginWithLocalCredentials(input);
      const token = await createLocalSessionToken(user.id);
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 8 * 60 * 60 * 1000 });
      return { id: user.id, name: user.name, username: user.username, role: user.role, operationalRole: user.operationalRole };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    summary: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "occurrences.view");
      return getDashboardData(ctx.user.operationalRole === "agente" ? ctx.user.teamId ?? -1 : undefined);
    }),
  }),
  reports: router({
    overview: operationalProcedure.input(reportFiltersInput).query(async ({ ctx, input }) => {
      const teamId = await resolveAuthorizedTeamFilter(ctx.user, input.teamId, "reports.view");
      return getOperationalReport({ ...input, teamId });
    }),
    export: operationalProcedure.input(reportFiltersInput.extend({ format: z.enum(["csv", "pdf"]) })).mutation(async ({ ctx, input }) => {
      const teamId = await resolveAuthorizedTeamFilter(ctx.user, input.teamId, "reports.export");
      const report = await getOperationalReport({ startDate: input.startDate, endDate: input.endDate, teamId });
      await auditOperationalReportExport({ actorUserId: ctx.user.id, format: input.format, report });
      return { success: true, generatedAt: report.generatedAt };
    }),
    savedFilters: router({
      list: operationalProcedure.query(async ({ ctx }) => {
        await assertPermission(ctx.user, "reports.view");
        return listDashboardSavedFilters(ctx.user.id);
      }),
      save: operationalProcedure.input(reportFiltersInput.extend({ name: z.string().trim().min(2).max(120), isDefault: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "reports.view");
        if (input.teamId) await assertTeamScope(ctx.user, input.teamId, "reports.view");
        return saveDashboardFilter({ userId: ctx.user.id, ...input });
      }),
      delete: operationalProcedure.input(z.object({ filterId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "reports.view");
        await deleteDashboardFilter({ userId: ctx.user.id, filterId: input.filterId });
        return { success: true };
      }),
    }),
  }),
  help: router({
    favorites: router({
      list: operationalProcedure.query(({ ctx }) => listHelpFavorites(ctx.user.id)),
      add: operationalProcedure.input(z.object({ contentType: z.enum(["manual", "faq"]), contentId: z.string().trim().regex(/^[a-z0-9-]{2,80}$/) })).mutation(({ ctx, input }) => addHelpFavorite({ userId: ctx.user.id, ...input })),
      remove: operationalProcedure.input(z.object({ contentType: z.enum(["manual", "faq"]), contentId: z.string().trim().regex(/^[a-z0-9-]{2,80}$/) })).mutation(async ({ ctx, input }) => {
        await removeHelpFavorite({ userId: ctx.user.id, ...input });
        return { success: true };
      }),
    }),
    suggestions: router({
      listMine: operationalProcedure.query(({ ctx }) => listOwnFaqSuggestions(ctx.user.id)),
      create: operationalProcedure.input(z.object({ question: z.string().trim().min(10).max(280), detail: z.string().trim().max(2000).optional() })).mutation(({ ctx, input }) => createFaqSuggestion({ userId: ctx.user.id, ...input })),
    }),
    // Any active user can read what a privilege means — the matrix of who
    // has what (access.roles / access.permissions) stays gated by roles.view.
    permissionGlossary: operationalProcedure.query(() => listAccessPermissionGlossary()),
  }),
  integrations: router({
    overview: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "integrations.view");
      return getSimulatedIntegrationsOverview(await getSimulatedIntegrationMetrics());
    }),
    events: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "integrations.view");
      return listIntegrationEventCatalog();
    }),
    ingressTestLog: operationalProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(25) })).query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "integrations.view");
      return listAlrtIngressTestLog(input.limit);
    }),
    externalReviews: router({
      list: operationalProcedure.query(async ({ ctx }) => {
        await assertPermission(ctx.user, "integrations.view");
        return listExternalIncidentReviews();
      }),
      confirm: operationalProcedure.input(z.object({ reviewId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "occurrences.create");
        return confirmExternalIncidentReview({ ...input, actorUserId: ctx.user.id });
      }),
    }),
    connections: router({
      list: operationalProcedure.query(async ({ ctx }) => {
        await assertPermission(ctx.user, "integrations.view");
        return listSimulatedIntegrationConnections();
      }),
      create: operationalProcedure.input(z.object({ code: z.string().trim().min(3).max(100), name: z.string().trim().min(3).max(180), description: z.string().trim().max(5000).nullable().optional(), connectionType: z.string().trim().min(2).max(80), baseUrl: z.string().trim().max(2048).nullable().optional() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "integrations.manage");
        return createSimulatedIntegrationConnection({ ...input, actorUserId: ctx.user.id });
      }),
      activateAlrtHomologation: operationalProcedure.mutation(async ({ ctx }) => {
        await assertPermission(ctx.user, "integrations.manage");
        return activateAlrtHomologationConnection({ actorUserId: ctx.user.id });
      }),
      approveAlrtProductionReadiness: operationalProcedure.mutation(async ({ ctx }) => {
        await assertIntegrationApprovalAdministrator(ctx.user);
        return approveAlrtProductionReadiness({ actorUserId: ctx.user.id });
      }),
      update: operationalProcedure.input(z.object({ connectionId: z.number().int().positive(), code: z.string().trim().min(3).max(100), name: z.string().trim().min(3).max(180), description: z.string().trim().max(5000).nullable().optional(), connectionType: z.string().trim().min(2).max(80), baseUrl: z.string().trim().max(2048).nullable().optional() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "integrations.manage");
        await updateSimulatedIntegrationConnection({ ...input, actorUserId: ctx.user.id });
        return { success: true };
      }),
      delete: operationalProcedure.input(z.object({ connectionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "integrations.manage");
        await deleteSimulatedIntegrationConnection({ ...input, actorUserId: ctx.user.id });
        return { success: true };
      }),
    }),
    webhooks: router({
      list: operationalProcedure.query(async ({ ctx }) => {
        await assertPermission(ctx.user, "webhook.manage");
        return listSimulatedIntegrationWebhooks();
      }),
      create: operationalProcedure.input(z.object({ name: z.string().trim().min(3).max(180), method: z.enum(["POST", "PUT", "PATCH"]).default("POST"), path: z.string().trim().min(2).max(255), workflowId: z.number().int().positive().nullable().optional(), allowedIps: z.array(z.string().trim().min(3).max(64)).max(30).nullable().optional() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "webhook.manage");
        return createSimulatedIntegrationWebhook({ ...input, actorUserId: ctx.user.id });
      }),
      delete: operationalProcedure.input(z.object({ webhookId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "webhook.manage");
        await deleteSimulatedIntegrationWebhook({ ...input, actorUserId: ctx.user.id });
        return { success: true };
      }),
    }),
    credentials: router({
      list: operationalProcedure.query(async ({ ctx }) => {
        await assertPermission(ctx.user, "credentials.manage");
        return listSimulatedIntegrationCredentials();
      }),
      create: operationalProcedure.input(z.object({ name: z.string().trim().min(3).max(180), credentialType: z.string().trim().min(2).max(80), description: z.string().trim().max(5000).nullable().optional() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "credentials.manage");
        return createSimulatedIntegrationCredential({ ...input, actorUserId: ctx.user.id });
      }),
      delete: operationalProcedure.input(z.object({ credentialId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "credentials.manage");
        await deleteSimulatedIntegrationCredential({ ...input, actorUserId: ctx.user.id });
        return { success: true };
      }),
    }),
    logs: operationalProcedure.input(z.object({ workflowId: z.number().int().positive().optional(), level: z.enum(["info", "aviso", "erro"]).optional(), limit: z.number().int().min(1).max(200).optional() }).optional()).query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "logs.view");
      return listSanitizedIntegrationLogs(input ?? {});
    }),
    openapi: router({
      internal: operationalProcedure.query(async ({ ctx }) => {
        await assertPermission(ctx.user, "apidocs.view");
        return getInternalOpenapiCatalog();
      }),
      specs: operationalProcedure.query(async ({ ctx }) => {
        await assertPermission(ctx.user, "apidocs.view");
        return listImportedOpenapiSpecs();
      }),
      spec: operationalProcedure.input(z.object({ specId: z.number().int().positive() })).query(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "apidocs.view");
        return getImportedOpenapiSpec(input.specId);
      }),
      import: operationalProcedure.input(z.object({ document: z.string().min(1).max(1_000_000), format: z.enum(["auto", "json", "yaml"]).default("auto") })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "apidocs.test");
        return importSimulatedOpenapiSpec({ ...input, actorUserId: ctx.user.id });
      }),
      generateConnector: operationalProcedure.input(z.object({ operationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "apidocs.test");
        await assertPermission(ctx.user, "integrations.manage");
        return generateSimulatedConnectorFromOpenapiOperation({ ...input, actorUserId: ctx.user.id });
      }),
      testSimulation: operationalProcedure.input(z.object({ operationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "apidocs.test");
        return simulateOpenapiOperationTest({ ...input, actorUserId: ctx.user.id });
      }),
    }),
  }),
  workflows: router({
    list: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "workflow.view");
      return listSimulatedWorkflows();
    }),
    get: operationalProcedure.input(z.object({ workflowId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "workflow.view");
      return getSimulatedWorkflow(input.workflowId);
    }),
    create: operationalProcedure.input(z.object({ name: z.string().trim().min(3).max(180), description: z.string().trim().max(5000).nullable().optional() })).mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "workflow.create");
      return createSimulatedWorkflow({ ...input, actorUserId: ctx.user.id });
    }),
    update: operationalProcedure.input(z.object({ workflowId: z.number().int().positive(), name: z.string().trim().min(3).max(180), description: z.string().trim().max(5000).nullable().optional(), definition: z.unknown().optional(), changeSummary: z.string().trim().max(500).nullable().optional() })).mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "workflow.edit");
      return updateSimulatedWorkflow({ ...input, actorUserId: ctx.user.id });
    }),
    setActive: operationalProcedure.input(z.object({ workflowId: z.number().int().positive(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "workflow.activate");
      await setSimulatedWorkflowActive({ ...input, actorUserId: ctx.user.id });
      return { success: true };
    }),
    delete: operationalProcedure.input(z.object({ workflowId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "workflow.delete");
      await deleteSimulatedWorkflow({ ...input, actorUserId: ctx.user.id });
      return { success: true };
    }),
    executions: operationalProcedure.input(z.object({ workflowId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).optional() }).optional()).query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "logs.view");
      return listSimulatedWorkflowExecutions(input ?? {});
    }),
    execution: operationalProcedure.input(z.object({ executionId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "logs.view");
      return getSimulatedWorkflowExecution(input.executionId);
    }),
    execute: operationalProcedure.input(z.object({ workflowId: z.number().int().positive(), simulateFailure: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "workflow.execute");
      return executeSimulatedWorkflow({ workflowId: input.workflowId, actorUserId: ctx.user.id, inputData: input.simulateFailure ? { simulateFailure: true } : {} });
    }),
    retryExecution: operationalProcedure.input(z.object({ executionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "workflow.execute");
      return retrySimulatedWorkflowExecution({ ...input, actorUserId: ctx.user.id });
    }),
  }),
  incidents: router({
    list: operationalProcedure
      .input(paginationInput.extend({ search: z.string().trim().max(120).optional(), status: statusEnum.optional(), priority: priorityEnum.optional(), teamId: z.number().int().positive().optional() }))
      .query(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "occurrences.view");
        return listIncidents({ ...input, teamId: ctx.user.operationalRole === "agente" ? ctx.user.teamId ?? -1 : input.teamId });
      }),
    get: operationalProcedure.input(z.object({ incidentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const result = await getIncidentById(input.incidentId);
      const incident = requireIncident(result);
      await assertPermission(ctx.user, "occurrences.view");
      if (incident.assignedTeamId) await assertTeamScope(ctx.user, incident.assignedTeamId, "occurrences.view");
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
        return createIncident({ ...input, actorUserId: ctx.user.id });
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
        assertCanEditIncident(ctx.user, requireIncident(await getIncidentById(input.incidentId)));
        return updateIncident({ ...input, actorUserId: ctx.user.id });
      }),
    permanentlyDelete: operationalProcedure
      .input(z.object({ incidentId: z.number().int().positive(), reason: z.string().trim().min(10).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        await assertSuperAdministrator(ctx.user);
        return permanentlyDeleteIncident({ ...input, actorUserId: ctx.user.id });
      }),
    transition: operationalProcedure
      .input(z.object({ incidentId: z.number().int().positive(), nextStatus: statusEnum, note: z.string().trim().min(3).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        const incident = requireIncident(await getIncidentById(input.incidentId));
        await assertPermission(ctx.user, input.nextStatus === "concluida" ? "occurrences.close" : "occurrences.transition");
        if (incident.assignedTeamId) await assertTeamScope(ctx.user, incident.assignedTeamId, input.nextStatus === "concluida" ? "occurrences.close" : "occurrences.transition");
        if (!INCIDENT_TRANSITIONS[incident.status].includes(input.nextStatus)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Transição de status inválida." });
        }
        assertCanTransitionIncident(ctx.user, incident, input.nextStatus);
        return transitionIncident({ ...input, actorUserId: ctx.user.id });
      }),
    assign: operationalProcedure
      .input(z.object({ incidentId: z.number().int().positive(), teamId: z.number().int().positive(), vehicleId: z.number().int().positive().optional(), estimatedArrivalMinutes: z.number().int().min(1).max(720).optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "dispatch.create");
        await assertTeamScope(ctx.user, input.teamId, "dispatch.create");
        const incident = requireIncident(await getIncidentById(input.incidentId));
        if (!(incident.status === "triagem" || incident.status === "aguardando_despacho")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A ocorrência não está disponível para despacho." });
        }
        return assignTeamToIncident({ ...input, actorUserId: ctx.user.id });
      }),
    respondToAssignment: operationalProcedure
      .input(z.object({ incidentId: z.number().int().positive(), accepted: z.boolean(), note: z.string().trim().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.teamId) throw new TRPCError({ code: "FORBIDDEN", message: "Agente sem equipe vinculada." });
        await assertTeamScope(ctx.user, ctx.user.teamId, "occurrences.transition");
        assertOwnTeam(ctx.user, ctx.user.teamId);
        assertCanReadIncident(ctx.user, requireIncident(await getIncidentById(input.incidentId)));
        return respondToAssignment({ ...input, teamId: ctx.user.teamId, actorUserId: ctx.user.id });
      }),
    evidence: router({
      list: operationalProcedure.input(z.object({ incidentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
        const incident = requireIncident(await getIncidentById(input.incidentId));
        await assertPermission(ctx.user, "occurrences.view");
        if (incident.assignedTeamId) await assertTeamScope(ctx.user, incident.assignedTeamId, "occurrences.view");
        assertCanReadIncident(ctx.user, incident);
        return listIncidentEvidence(input.incidentId);
      }),
      upload: operationalProcedure.input(z.object({ incidentId: z.number().int().positive(), fileName: z.string().trim().min(1).max(255), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), description: z.string().trim().max(1000).nullable().optional(), dataBase64: z.string().min(4).max(11_200_000) })).mutation(async ({ ctx, input }) => {
        if (!ctx.user.teamId) throw new TRPCError({ code: "FORBIDDEN", message: "Agente sem equipe vinculada." });
        await assertPermission(ctx.user, "occurrences.view");
        const incident = requireIncident(await getIncidentById(input.incidentId));
        await assertTeamScope(ctx.user, ctx.user.teamId, "occurrences.view");
        assertCanAddIncidentEvidence(ctx.user, incident);
        return addIncidentEvidence({ ...input, teamId: ctx.user.teamId, actorUserId: ctx.user.id });
      }),
    }),
    timeline: operationalProcedure.input(z.object({ incidentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const incident = requireIncident(await getIncidentById(input.incidentId));
      await assertPermission(ctx.user, "occurrences.view");
      if (incident.assignedTeamId) await assertTeamScope(ctx.user, incident.assignedTeamId, "occurrences.view");
      assertCanReadIncident(ctx.user, incident);
      return getIncidentTimeline(input.incidentId);
    }),
    audit: operationalProcedure.input(z.object({ incidentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "audit.view");
      return getIncidentAudit(input.incidentId);
    }),
    export: operationalProcedure
      .input(z.object({ search: z.string().trim().max(120).optional(), status: statusEnum.optional(), priority: priorityEnum.optional(), teamId: z.number().int().positive().optional() }))
      .query(async ({ ctx, input }) => {
        const teamId = await resolveAuthorizedTeamFilter(ctx.user, input.teamId, "reports.export");
        const result = await listIncidents({ ...input, teamId, page: 1, pageSize: 100 });
        return result.rows.map(({ incident, teamCode }) => ({
          codigo: incident.code,
          situacao: incident.status,
          prioridade: incident.priority,
          tipificacao: incident.category,
          endereco: incident.address,
          equipe: teamCode ?? "",
          criadoEm: incident.createdAt.toISOString(),
        }));
      }),
  }),
  audit: router({
    operations: operationalProcedure
      .input(paginationInput.extend({ resourceType: z.string().trim().min(2).max(80).optional(), search: z.string().trim().max(120).optional() }))
      .query(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "audit.view");
        return listOperationLogs(input);
      }),
  }),
  teams: router({
    list: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "teams.view");
      return listTeams(ctx.user.operationalRole === "agente" ? ctx.user.teamId ?? -1 : undefined);
    }),
    create: operationalProcedure
      .input(z.object({ code: z.string().trim().min(2).max(32), name: z.string().trim().min(3).max(160), agency: z.string().trim().min(3).max(160), organizationId: z.number().int().positive().nullable().optional(), organizationalUnitId: z.number().int().positive().nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "teams.manage");
        return createTeam({ ...input, actorUserId: ctx.user.id });
      }),
    updateStatus: operationalProcedure
      .input(z.object({ teamId: z.number().int().positive(), status: z.enum(["disponivel", "em_deslocamento", "em_atendimento", "pausada", "indisponivel"]) }))
      .mutation(async ({ ctx, input }) => {
        await assertTeamScope(ctx.user, input.teamId, "teams.manage");
        if (ctx.user.operationalRole === "agente") assertOwnTeam(ctx.user, input.teamId);
        await updateTeamStatus({ ...input, actorUserId: ctx.user.id });
        return { success: true };
      }),
    updateShift: operationalProcedure
      .input(z.object({ teamId: z.number().int().positive(), action: z.enum(["start", "pause", "resume", "end"]) }))
      .mutation(async ({ ctx, input }) => {
        await assertTeamScope(ctx.user, input.teamId, "teams.manage");
        if (ctx.user.operationalRole === "agente") assertOwnTeam(ctx.user, input.teamId);
        await updateTeamShift({ ...input, actorUserId: ctx.user.id });
        return { success: true };
      }),
    recordLocation: operationalProcedure
      .input(z.object({
        teamId: z.number().int().positive(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracyMeters: z.number().min(0).max(10000).optional(),
        speedMetersPerSecond: z.number().min(0).max(150).optional(),
        headingDegrees: z.number().min(0).max(360).optional(),
        capturedAt: z.date(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertTeamScope(ctx.user, input.teamId, "occurrences.transition");
        assertOwnTeam(ctx.user, input.teamId);
        await recordTeamLocation({ ...input, userId: ctx.user.id });
        return { success: true };
      }),
  }),
  vehicles: router({
    list: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "vehicles.view");
      return listVehicles();
    }),
    create: operationalProcedure
      .input(z.object({ prefix: z.string().trim().min(2).max(32), licensePlate: z.string().trim().min(5).max(16), model: z.string().trim().max(120).optional(), type: z.string().trim().min(2).max(80), teamId: z.number().int().positive().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "vehicles.manage");
        return createVehicle({ ...input, actorUserId: ctx.user.id });
      }),
    updateStatus: operationalProcedure
      .input(z.object({ vehicleId: z.number().int().positive(), status: z.enum(["operacional", "manutencao", "indisponivel"]) }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "vehicles.manage");
        await updateVehicleStatus({ ...input, actorUserId: ctx.user.id });
        return { success: true };
      }),
  }),
  administration: router({
    users: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "users.view");
      return listUsersForAdministration();
    }),
    updateUser: operationalProcedure
      .input(z.object({ userId: z.number().int().positive(), operationalRole: roleEnum, teamId: z.number().int().positive().nullable().optional(), active: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "users.edit");
        await updateOperationalUser({ ...input, actorUserId: ctx.user.id });
        return { success: true };
      }),
  }),
  access: router({
    me: operationalProcedure.query(({ ctx }) => getEffectiveAccess(ctx.user)),
    roles: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "roles.view");
      return listAccessRoles();
    }),
    permissions: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "roles.view");
      return listAccessPermissions();
    }),
    createPermission: operationalProcedure
      .input(z.object({ code: z.string().trim().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/).min(3).max(120), resource: z.string().trim().regex(/^[a-z0-9_]+$/).min(2).max(80), action: z.string().trim().regex(/^[a-z0-9_]+$/).min(2).max(80), description: z.string().trim().min(3).max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "roles.create");
        return createAccessPermission({ ...input, actorUserId: ctx.user.id });
      }),
    scopes: operationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "roles.view");
      return listOrganizationsAndUnits();
    }),
    createOrganization: operationalProcedure
      .input(z.object({ code: z.string().trim().regex(/^[a-z0-9_]+$/).min(2).max(48), name: z.string().trim().min(3).max(200) }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "system.configure");
        return createOrganization({ ...input, actorUserId: ctx.user.id });
      }),
    createOrganizationalUnit: operationalProcedure
      .input(z.object({ organizationId: z.number().int().positive(), parentId: z.number().int().positive().nullable().optional(), type: z.enum(["organizacao", "regional", "unidade", "departamento", "grupo"]), code: z.string().trim().regex(/^[a-z0-9_]+$/).min(2).max(48), name: z.string().trim().min(3).max(200) }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "system.configure");
        return createOrganizationalUnit({ ...input, actorUserId: ctx.user.id });
      }),
    updateOrganization: operationalProcedure
      .input(z.object({ organizationId: z.number().int().positive(), code: z.string().trim().regex(/^[a-z0-9_]+$/).min(2).max(48), name: z.string().trim().min(3).max(200) }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "system.configure");
        return updateOrganization({ ...input, actorUserId: ctx.user.id });
      }),
    updateOrganizationalUnit: operationalProcedure
      .input(z.object({ unitId: z.number().int().positive(), parentId: z.number().int().positive().nullable().optional(), type: z.enum(["organizacao", "regional", "unidade", "departamento", "grupo"]), code: z.string().trim().regex(/^[a-z0-9_]+$/).min(2).max(48), name: z.string().trim().min(3).max(200) }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "system.configure");
        return updateOrganizationalUnit({ ...input, actorUserId: ctx.user.id });
      }),
    users: operationalProcedure
      .input(paginationInput.extend({ search: z.string().trim().max(120).optional(), active: z.boolean().optional() }))
      .query(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "users.view");
        return listUsersWithAccess(input);
      }),
    myProfilePhoto: operationalProcedure.query(({ ctx }) => getOwnProfilePhoto(ctx.user.id)),
    createUser: operationalProcedure
      .input(z.object({ displayName: z.string().trim().min(3).max(160), email: z.string().trim().email().max(320), username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,64}$/).max(64).optional(), password: z.string().min(12).max(256).optional(), employeeId: z.string().trim().max(80).nullable().optional(), institutionalId: z.string().trim().max(80).nullable().optional(), phone: z.string().trim().max(40).nullable().optional(), jobTitle: z.string().trim().max(120).nullable().optional(), operationalRole: roleEnum, active: z.boolean().default(true), teamId: z.number().int().positive().nullable().optional(), roleId: z.number().int().positive(), organizationId: z.number().int().positive().nullable().optional(), organizationalUnitId: z.number().int().positive().nullable().optional(), roleTeamId: z.number().int().positive().nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "users.edit");
        if (Boolean(input.username) !== Boolean(input.password)) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe usuário e senha juntos ou deixe ambos em branco para pré-cadastro." });
        return createManualUser({ ...input, username: input.username ? normalizeUsername(input.username) : null, passwordHash: input.password ? await hashLocalPassword(input.password) : null, actorUserId: ctx.user.id });
      }),
    createRole: operationalProcedure
      .input(z.object({ code: z.string().trim().regex(/^[a-z0-9_]+$/).min(3).max(80), name: z.string().trim().min(3).max(160), description: z.string().trim().max(1000).optional(), defaultScope: accessScopeEnum, permissionIds: z.array(z.number().int().positive()).max(100) }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "roles.create");
        return createAccessRole({ ...input, actorUserId: ctx.user.id });
      }),
    updateRole: operationalProcedure
      .input(z.object({ roleId: z.number().int().positive(), name: z.string().trim().min(3).max(160).optional(), description: z.string().trim().max(1000).nullable().optional(), defaultScope: accessScopeEnum.optional(), permissionIds: z.array(z.number().int().positive()).max(100).optional(), active: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "roles.edit");
        await updateAccessRole({ ...input, actorUserId: ctx.user.id });
        return { success: true };
      }),
    assignRole: operationalProcedure
      .input(z.object({ userId: z.number().int().positive(), roleId: z.number().int().positive(), organizationId: z.number().int().positive().nullable().optional(), organizationalUnitId: z.number().int().positive().nullable().optional(), teamId: z.number().int().positive().nullable().optional(), expiresAt: z.date().nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "roles.assign");
        return assignUserRole({ ...input, actorUserId: ctx.user.id });
      }),
    setAssignmentActive: operationalProcedure
      .input(z.object({ assignmentId: z.number().int().positive(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "roles.assign");
        await setUserRoleAssignmentActive({ ...input, actorUserId: ctx.user.id });
        return { success: true };
      }),
    updateUserProfile: operationalProcedure
      .input(z.object({ userId: z.number().int().positive(), active: z.boolean().optional(), displayName: z.string().trim().max(160).nullable().optional(), employeeId: z.string().trim().max(80).nullable().optional(), institutionalId: z.string().trim().max(80).nullable().optional(), phone: z.string().trim().max(40).nullable().optional(), jobTitle: z.string().trim().max(120).nullable().optional(), mfaEnabled: z.boolean().optional(), accessExpiresAt: z.date().nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, input.active === false ? "users.disable" : "users.edit");
        await updateUserProfileAccess({ ...input, actorUserId: ctx.user.id });
        return { success: true };
      }),
    setLocalCredentials: operationalProcedure
      .input(z.object({ userId: z.number().int().positive(), username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,64}$/), password: z.string().min(12).max(256) }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "users.edit");
        return setUserLocalCredentials({ userId: input.userId, username: normalizeUsername(input.username), passwordHash: await hashLocalPassword(input.password), actorUserId: ctx.user.id });
      }),
    uploadUserProfilePhoto: operationalProcedure
      .input(z.object({ userId: z.number().int().positive(), fileName: z.string().trim().min(1).max(255), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().max(3_000_000) }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "users.edit");
        return uploadUserProfilePhoto({ ...input, actorUserId: ctx.user.id });
      }),
  }),
  settings: router({
    operationalMap: operationalProcedure.query(() => getOperationalMapSettings()),
    generalMap: operationalProcedure.query(async ({ ctx }) => {
      await assertSuperAdministrator(ctx.user);
      return getOperationalMapSettings();
    }),
    futureEntries: operationalProcedure.query(async ({ ctx }) => {
      await assertSuperAdministrator(ctx.user);
      return listFutureGeneralSettingEntries();
    }),
    resetPreview: operationalProcedure.input(z.object({ scope: z.enum(["operational", "total"]).default("operational") })).query(async ({ ctx, input }) => {
      await assertSuperAdministrator(ctx.user);
      return getSolutionResetPreview({ ...input, actorUserId: ctx.user.id });
    }),
    updateGeneralMap: operationalProcedure
      .input(z.object({ centerLatitude: z.number().min(-90).max(90), centerLongitude: z.number().min(-180).max(180), defaultZoom: z.number().int().min(8).max(20), mapType: z.enum(["roadmap", "satellite", "terrain", "hybrid", "carto"]), trafficEnabled: z.boolean(), autoFitEnabled: z.boolean(), fallbackMode: z.enum(["automatic", "openstreetmap"]) }))
      .mutation(async ({ ctx, input }) => {
        await assertSuperAdministrator(ctx.user);
        return updateGeneralMapSettings({ ...input, actorUserId: ctx.user.id });
      }),
    resetOperationalData: operationalProcedure
      .input(z.object({ scope: z.enum(["operational", "total"]), confirmation: z.string().trim().max(80), reason: z.string().trim().min(10).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        await assertSuperAdministrator(ctx.user);
        return resetSolutionOperationalData({ ...input, actorUserId: ctx.user.id });
      }),
  }),
});

export type AppRouter = typeof appRouter;
