import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";
import { teams } from "../../drizzle/schema";
import { workspaceWidgetTypes, type WorkspaceWidgetType } from "@shared/workspaceLayout";
import { getEffectiveAccess } from "../accessControl";
import { getDb } from "../db";
import type { WorkspaceAccessContext } from "./workspaceLayoutService";

type WorkspaceUser = NonNullable<TrpcContext["user"]>;

type WorkspaceAssignment = {
  organizationId?: number | null;
};

type WorkspaceEffectiveAccess = {
  permissions: string[];
  assignments: WorkspaceAssignment[];
};

export type WorkspaceAccessContextDependencies = {
  findTeamOrganizationId(teamId: number): Promise<number | null | undefined>;
  getEffectiveAccess(user: WorkspaceUser): Promise<WorkspaceEffectiveAccess>;
};

const requiredPermissionByWidget: Record<WorkspaceWidgetType, string> = {
  "operational-map": "occurrences.view",
  metrics: "occurrences.view",
  "priority-queue": "occurrences.view",
  incidents: "occurrences.view",
  teams: "teams.view",
  "work-shift": "work_shifts.view",
  kanban: "occurrences.view",
  "incident-detail": "occurrences.view",
  resources: "teams.view",
  "sla-alerts": "occurrences.view",
  "neo-communication": "embedded_apps.view",
  "operational-timeline": "occurrences.view",
  "dynamic-form": "forms.view",
  "configurable-dashboard": "occurrences.view",
  "authorized-iframe": "embedded_apps.view",
};

async function findTeamOrganizationId(teamId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para resolver tenant do workspace.");
  const row = (await db
    .select({ organizationId: teams.organizationId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1))[0];
  return row?.organizationId ?? null;
}

function resolveAllowedWidgetTypes(permissions: Iterable<string>): Set<WorkspaceWidgetType> {
  const permissionSet = new Set(permissions);
  if (permissionSet.has("*")) return new Set(workspaceWidgetTypes);
  return new Set(workspaceWidgetTypes.filter(type => permissionSet.has(requiredPermissionByWidget[type])));
}

function authorizedOrganizationIds(assignments: WorkspaceAssignment[]) {
  return Array.from(new Set(assignments
    .map(assignment => assignment.organizationId)
    .filter((organizationId): organizationId is number =>
      Number.isInteger(organizationId) && Number(organizationId) > 0,
    )));
}

const defaultDependencies: WorkspaceAccessContextDependencies = {
  findTeamOrganizationId,
  getEffectiveAccess: user => getEffectiveAccess(user),
};

export function createWorkspaceAccessContextResolver(
  dependencies: WorkspaceAccessContextDependencies = defaultDependencies,
) {
  return async function resolveWorkspaceAccessContext(
    ctx: Pick<TrpcContext, "user">,
  ): Promise<WorkspaceAccessContext> {
    const user = ctx.user;
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação obrigatória para acessar o workspace." });
    if (!user.active) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });

    const access = await dependencies.getEffectiveAccess(user);
    let tenantId: number;

    if (user.teamId) {
      const organizationId = await dependencies.findTeamOrganizationId(user.teamId);
      if (!organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A equipe do usuário não possui organização/tenant válida para o workspace." });
      }
      tenantId = organizationId;
    } else {
      const organizationIds = authorizedOrganizationIds(access.assignments);
      if (organizationIds.length !== 1) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Não foi possível resolver de forma inequívoca o tenant do workspace." });
      }
      tenantId = organizationIds[0];
    }

    return {
      tenantId,
      userId: user.id,
      allowedWidgetTypes: resolveAllowedWidgetTypes(access.permissions),
    };
  };
}

export const resolveWorkspaceAccessContext = createWorkspaceAccessContextResolver();
