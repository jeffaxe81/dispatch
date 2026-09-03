// Default access-control catalog: the privilege codes actually enforced
// across appRouter (via assertPermission) or gating navigation, and the
// five default profiles built from them. Seeded idempotently at boot
// (see ensureDefaultAccessCatalog) so the "Perfis" screen and the
// Aplicativo Agente / operational role assignment flow — which already
// hard-depends on an active "agente_campo" role existing — have data to
// work with from the first boot, without a schema migration.
import { eq } from "drizzle-orm";
import { accessPermissions, accessRoles, rolePermissions } from "../drizzle/schema";
import { getDb } from "./db";

export type DefaultPermission = { code: string; resource: string; action: string; description: string };

export const DEFAULT_ACCESS_PERMISSIONS: DefaultPermission[] = [
  { code: "occurrences.view", resource: "occurrences", action: "view", description: "Ver ocorrências e seus detalhes." },
  { code: "occurrences.create", resource: "occurrences", action: "create", description: "Registrar novas ocorrências." },
  { code: "occurrences.edit", resource: "occurrences", action: "edit", description: "Editar os dados de uma ocorrência existente." },
  { code: "occurrences.transition", resource: "occurrences", action: "transition", description: "Alterar o status de uma ocorrência (aceitar, iniciar atendimento, pausar, cancelar)." },
  { code: "occurrences.close", resource: "occurrences", action: "close", description: "Concluir o atendimento de uma ocorrência." },
  { code: "dispatch.create", resource: "dispatch", action: "create", description: "Despachar equipes e viaturas para uma ocorrência." },
  { code: "dispatch.view", resource: "dispatch", action: "view", description: "Ver o painel de despacho (Kanban)." },
  { code: "teams.view", resource: "teams", action: "view", description: "Ver as equipes cadastradas e sua localização." },
  { code: "teams.manage", resource: "teams", action: "manage", description: "Cadastrar, editar e gerenciar a situação e a jornada das equipes." },
  { code: "vehicles.view", resource: "vehicles", action: "view", description: "Ver as viaturas cadastradas." },
  { code: "vehicles.manage", resource: "vehicles", action: "manage", description: "Cadastrar, editar e gerenciar a situação da frota." },
  { code: "reports.view", resource: "reports", action: "view", description: "Ver relatórios operacionais." },
  { code: "reports.export", resource: "reports", action: "export", description: "Exportar relatórios operacionais (CSV/PDF)." },
  { code: "users.view", resource: "users", action: "view", description: "Ver os usuários cadastrados." },
  { code: "users.edit", resource: "users", action: "edit", description: "Criar e editar usuários, perfil operacional e credenciais." },
  { code: "users.disable", resource: "users", action: "disable", description: "Desativar o acesso de um usuário." },
  { code: "roles.view", resource: "roles", action: "view", description: "Ver os perfis e as permissões cadastrados." },
  { code: "roles.create", resource: "roles", action: "create", description: "Criar novos perfis e permissões locais." },
  { code: "roles.edit", resource: "roles", action: "edit", description: "Editar perfis locais e sua matriz de permissões." },
  { code: "roles.assign", resource: "roles", action: "assign", description: "Vincular um perfil a um usuário, com escopo." },
  { code: "workflow.view", resource: "workflow", action: "view", description: "Ver os workflows cadastrados." },
  { code: "workflow.create", resource: "workflow", action: "create", description: "Criar novos workflows." },
  { code: "workflow.edit", resource: "workflow", action: "edit", description: "Editar workflows existentes." },
  { code: "workflow.activate", resource: "workflow", action: "activate", description: "Ativar ou desativar um workflow." },
  { code: "workflow.execute", resource: "workflow", action: "execute", description: "Executar manualmente um workflow (em simulação)." },
  { code: "workflow.delete", resource: "workflow", action: "delete", description: "Excluir um workflow." },
  { code: "system.configure", resource: "system", action: "configure", description: "Alterar configurações gerais e a estrutura organizacional." },
  { code: "integrations.view", resource: "integrations", action: "view", description: "Ver as conexões e integrações cadastradas." },
  { code: "integrations.manage", resource: "integrations", action: "manage", description: "Criar, editar e pré-aprovar integrações." },
  { code: "webhook.manage", resource: "webhook", action: "manage", description: "Gerenciar webhooks de integração." },
  { code: "credentials.manage", resource: "credentials", action: "manage", description: "Gerenciar credenciais de integrações externas." },
  { code: "audit.view", resource: "audit", action: "view", description: "Ver o log de auditoria e o histórico de operações." },
  { code: "logs.view", resource: "logs", action: "view", description: "Ver os logs de execução de integrações e workflows." },
  { code: "apidocs.view", resource: "apidocs", action: "view", description: "Ver a documentação interna de APIs." },
  { code: "apidocs.test", resource: "apidocs", action: "test", description: "Testar chamadas de API pela documentação interna (somente simulação)." },
];

const ALL_PERMISSION_CODES = DEFAULT_ACCESS_PERMISSIONS.map(permission => permission.code);

export type DefaultRole = {
  code: string;
  name: string;
  description: string;
  defaultScope: typeof accessRoles.$inferInsert.defaultScope;
  permissionCodes: string[];
};

export const DEFAULT_ACCESS_ROLES: DefaultRole[] = [
  {
    code: "administrador",
    name: "Administrador",
    description: "Acesso completo à solução: usuários, perfis, configurações gerais, integrações e todos os recursos operacionais.",
    defaultScope: "global",
    permissionCodes: ALL_PERMISSION_CODES,
  },
  {
    code: "supervisor",
    name: "Supervisor",
    description: "Acompanha ocorrências, equipes e relatórios, com autoridade para intervir no atendimento e revisar a auditoria.",
    defaultScope: "organizacao",
    permissionCodes: ["occurrences.view", "occurrences.edit", "occurrences.transition", "occurrences.close", "dispatch.view", "teams.view", "vehicles.view", "reports.view", "reports.export", "workflow.view", "audit.view"],
  },
  {
    code: "despachador",
    name: "Despachador",
    description: "Registra ocorrências e despacha equipes e viaturas para atendimento.",
    defaultScope: "organizacao",
    permissionCodes: ["occurrences.view", "occurrences.create", "occurrences.edit", "occurrences.transition", "dispatch.create", "dispatch.view", "teams.view", "vehicles.view", "reports.view", "reports.export"],
  },
  {
    // Código fixo exigido por server/db.ts (updateOperationalUser e
    // reconcileOperationalRoleWithAssignments): sem este perfil ativo, a
    // atribuição do perfil operacional "Agente de Campo" a um usuário falha.
    code: "agente_campo",
    name: "Agente de Campo",
    description: "Atende, em campo, as ocorrências despachadas para a equipe vinculada.",
    defaultScope: "equipe",
    permissionCodes: ["occurrences.view", "occurrences.transition", "occurrences.close", "dispatch.view", "teams.view", "vehicles.view"],
  },
  {
    code: "agente_seguranca",
    name: "Agente de Segurança",
    description: "Acompanha ocorrências e a auditoria com foco em segurança operacional, sem despachar recursos.",
    defaultScope: "organizacao",
    permissionCodes: ["occurrences.view", "occurrences.transition", "occurrences.close", "teams.view", "vehicles.view", "reports.view", "audit.view"],
  },
];

/**
 * Idempotent: creates the default permission catalog and the five default
 * (system-protected) profiles on first boot, and backfills any permission
 * or grant added here later into roles that already exist. Safe to call
 * on every startup.
 */
export async function ensureDefaultAccessCatalog() {
  const db = await getDb();
  if (!db) return;

  await db.transaction(async tx => {
    const permissionIdByCode = new Map<string, number>();
    for (const permission of DEFAULT_ACCESS_PERMISSIONS) {
      const existing = (await tx.select({ id: accessPermissions.id }).from(accessPermissions).where(eq(accessPermissions.code, permission.code)).limit(1))[0];
      if (existing) {
        permissionIdByCode.set(permission.code, existing.id);
        continue;
      }
      const [created] = await tx.insert(accessPermissions).values({ code: permission.code, resource: permission.resource, action: permission.action, description: permission.description }).$returningId();
      permissionIdByCode.set(permission.code, created.id);
    }

    for (const role of DEFAULT_ACCESS_ROLES) {
      const existingRole = (await tx.select({ id: accessRoles.id }).from(accessRoles).where(eq(accessRoles.code, role.code)).limit(1))[0];
      const roleId = existingRole
        ? existingRole.id
        : (await tx.insert(accessRoles).values({ code: role.code, name: role.name, description: role.description, defaultScope: role.defaultScope, isSystem: true }).$returningId())[0].id;

      const existingGrants = await tx.select({ permissionId: rolePermissions.permissionId }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      const grantedIds = new Set(existingGrants.map(row => row.permissionId));
      const missingIds = role.permissionCodes
        .map(code => permissionIdByCode.get(code))
        .filter((id): id is number => id !== undefined && !grantedIds.has(id));
      if (missingIds.length) await tx.insert(rolePermissions).values(missingIds.map(permissionId => ({ roleId, permissionId })));
    }
  });
}

export async function listAccessPermissionGlossary() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ code: accessPermissions.code, resource: accessPermissions.resource, action: accessPermissions.action, description: accessPermissions.description }).from(accessPermissions).where(eq(accessPermissions.active, true)).orderBy(accessPermissions.resource, accessPermissions.action);
}
