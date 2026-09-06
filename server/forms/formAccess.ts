import type { OperationalRole } from "../../shared/operations";

export const FORM_PERMISSIONS = [
  "forms.view",
  "forms.fill",
  "forms.create",
  "forms.edit",
  "forms.publish",
  "forms.disable",
  "forms.responses.view",
  "forms.responses.correct",
  "forms.export",
  "forms.manage",
] as const;

export type FormPermission = typeof FORM_PERMISSIONS[number];

const legacyFormPermissions: Record<OperationalRole, ReadonlySet<FormPermission>> = {
  administrador: new Set(FORM_PERMISSIONS),
  supervisor: new Set(["forms.view", "forms.fill", "forms.responses.view", "forms.responses.correct"]),
  despachador: new Set(["forms.view", "forms.fill", "forms.responses.view"]),
  operador: new Set(["forms.view", "forms.fill"]),
  agente: new Set(["forms.view", "forms.fill"]),
};

export function evaluateFormPermission(
  input: {
    active: boolean;
    operationalRole: OperationalRole;
    hasDynamicAssignments: boolean;
    dynamicPermissions: Iterable<string>;
  },
  permission: FormPermission,
): boolean {
  if (!input.active) return false;
  if (input.hasDynamicAssignments) return new Set(input.dynamicPermissions).has(permission);
  return legacyFormPermissions[input.operationalRole]?.has(permission) ?? false;
}

export class FormTenantScopeError extends Error {
  readonly code = "FORM_TENANT_SCOPE_DENIED";
  constructor() {
    super("Acesso negado: o recurso pertence a outro tenant.");
    this.name = "FormTenantScopeError";
  }
}

export function assertFormTenantScope(currentTenantId: number, resourceTenantId: number): void {
  if (currentTenantId !== resourceTenantId) throw new FormTenantScopeError();
}
