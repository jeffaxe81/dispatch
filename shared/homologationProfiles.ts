/**
 * Restricted pre-production RBAC templates. They are NOT user assignments or
 * proof of production approval. They require an explicitly isolated
 * homologation runtime and are never effective without that runtime gate.
 */
export const HOMOLOGATION_ROLE_PREFIX = "homolog_" as const;

export const HOMOLOGATION_PROFILES = [
  {
    code: "homolog_observador", name: "Homologação · Observador",
    description: "Consulta funcional no ambiente isolado, sem alterar ocorrências, perfis ou integrações.",
    defaultScope: "organizacao",
    permissionCodes: ["occurrences.view","dispatch.view","teams.view","vehicles.view"],
  },
  {
    code: "homolog_executor", name: "Homologação · Executor",
    description: "Cria e edita ocorrências fictícias no ambiente isolado; não gerencia usuários, perfis nem integrações.",
    defaultScope: "organizacao",
    permissionCodes: ["occurrences.view","occurrences.create","occurrences.edit","dispatch.view","teams.view","vehicles.view"],
  },
  {
    code: "homolog_agente_campo", name: "Homologação · Agente de Campo",
    description: "Simula aceite e transições de ocorrências fictícias da própria equipe, sem autenticação nativa operacional.",
    defaultScope: "equipe",
    permissionCodes: ["occurrences.view","occurrences.transition","dispatch.view","teams.view","vehicles.view"],
  },
  {
    code: "homolog_auditor", name: "Homologação · Auditor de Segurança",
    description: "Consulta auditoria e relatórios sem poder alterar ocorrências, contas, perfis ou autorizar produção.",
    defaultScope: "organizacao",
    permissionCodes: ["audit.view","reports.view","occurrences.view"],
  },
  {
    code: "homolog_revisor", name: "Homologação · Revisor Independente",
    description: "Consulta evidências e relatórios. O aceite F04/F05/F06 permanece manual e externo a este papel.",
    defaultScope: "organizacao",
    permissionCodes: ["audit.view","reports.view"],
  },
] as const;

export type HomologationProfileCode = typeof HOMOLOGATION_PROFILES[number]["code"];

export function isHomologationProfileCode(code: unknown): code is HomologationProfileCode {
  return typeof code === "string" && HOMOLOGATION_PROFILES.some(role => role.code === code);
}

export function isReservedHomologationCode(code: unknown): boolean {
  return typeof code === "string" && code.startsWith(HOMOLOGATION_ROLE_PREFIX);
}

/** Fail closed. NODE_ENV=production can also be used in a dedicated QA stack. */
export function homologationRuntimeEnabled(stage: unknown, flag: unknown): boolean {
  return stage === "homologation" && flag === "true";
}

/** Server-side only. No implied auto-creation or production privileges. */
export function currentHomologationRuntimeEnabled(): boolean {
  return homologationRuntimeEnabled(process.env.AXE_DEPLOYMENT_STAGE, process.env.AXE_HOMOLOGATION_ENABLED);
}

export function validateHomologationRoleAssignment(input: {
  code: string;
  stage: unknown;
  enabled: unknown;
  userIsBaseAdmin: boolean;
  organizationId?: number | null;
  teamId?: number | null;
  expiresAt?: Date | null;
}, now = new Date()): boolean {
  if (!isHomologationProfileCode(input.code) ||
      !homologationRuntimeEnabled(input.stage, input.enabled) ||
      input.userIsBaseAdmin ||
      !Number.isSafeInteger(input.organizationId) || (input.organizationId ?? 0) <= 0 ||
      !(input.expiresAt instanceof Date) || !Number.isFinite(input.expiresAt.getTime()) ||
      input.expiresAt.getTime() <= now.getTime() ||
      input.expiresAt.getTime() > now.getTime() + 14 * 24 * 60 * 60 * 1000) return false;
  const profile = HOMOLOGATION_PROFILES.find(role => role.code === input.code);
  if (profile?.defaultScope === "equipe" &&
      (!Number.isSafeInteger(input.teamId) || (input.teamId ?? 0) <= 0)) return false;
  return true;
}

/**
 * Keep reserved assignments present even with no effective privileges. The
 * caller must not restore legacy permissions after filtering.
 */
export function filterRolePermissionCodes(
  rows: readonly { code: string; roleCode: string }[],
  stage: unknown, enabled: unknown,
): string[] {
  const sandbox = homologationRuntimeEnabled(stage, enabled);
  return [...new Set(rows.filter(row => sandbox || !isReservedHomologationCode(row.roleCode)).map(row => row.code))];
}

// Strict allowlist: a dynamic permission alone does not bypass operational
// policies, tenant selection or the server's incident transition rules.
export const HOMOLOGATION_ROUTE_PERMISSIONS = {
  "access.me": null,
  "access.myDeniedPermissions": null,
  "tenant.selection": null,
  "dashboard.summary": "occurrences.view",
  "incidents.list": "occurrences.view",
  "incidents.get": "occurrences.view",
  "incidents.timeline": "occurrences.view",
  "incidents.evidence.list": "occurrences.view",
  "incidents.create": "occurrences.create",
  "incidents.update": "occurrences.edit",
  "incidents.transition": "occurrences.transition",
  "incidents.respondToAssignment": "occurrences.transition",
  "teams.list": "teams.view",
  "vehicles.list": "vehicles.view",
  "gis.route": "occurrences.view",
  "audit.operations": "audit.view",
  "reports.overview": "reports.view",
} as const;

export function isHomologationRouteAllowed(
  roleCode: unknown, route: unknown, dynamicPermissions: Iterable<string>,
): boolean {
  if (!isHomologationProfileCode(roleCode) || typeof route !== "string") return false;
  if (!Object.prototype.hasOwnProperty.call(HOMOLOGATION_ROUTE_PERMISSIONS, route)) return false;
  const needed = HOMOLOGATION_ROUTE_PERMISSIONS[route as keyof typeof HOMOLOGATION_ROUTE_PERMISSIONS];
  const role = HOMOLOGATION_PROFILES.find(x => x.code === roleCode);
  // Must be both part of the versioned role template AND granted in the DB;
  // an injected permission cannot open an unreviewed route.
  return needed === null || (role!.permissionCodes as readonly string[]).includes(needed) &&
    new Set(dynamicPermissions).has(needed);
}

export function mustUseDynamicAuthorization(
  validAssignmentCount: number, hasHistoricQaRole: boolean,
): boolean {
  return validAssignmentCount > 0 || hasHistoricQaRole;
}
