import type { User } from "../../drizzle/schema";
import type { FormPermission } from "./formAccess";

export type FormsContextUser = Pick<User, "id" | "teamId">;
export type FormsContextPorts = {
  resolveTenantId(user: { userId: number; teamId: number | null }): Promise<number>;
  hasPermission(user: User, permission: FormPermission): Promise<boolean>;
  service: Record<string, (...args: any[]) => any>;
};

export async function createFormsRequestContext(user: User | null, ports: FormsContextPorts) {
  if (!user) throw new Error("Usuário autenticado é obrigatório para acessar formulários.");
  const tenantId = await ports.resolveTenantId({ userId: user.id, teamId: user.teamId });
  return {
    tenantId,
    userId: user.id,
    service: ports.service,
    hasPermission: (permission: FormPermission) => ports.hasPermission(user, permission),
  };
}
