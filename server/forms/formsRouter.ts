import type { FormPermission } from "./formAccess";

type ApiContext = { tenantId: number; userId: number; hasPermission(permission: FormPermission): boolean; service: Record<string, (...args: any[]) => any> };

function denied(permission: string): never { throw new Error(`Permissão necessária: ${permission}`); }

export function createFormsApi(ctx: ApiContext) {
  const call = async (permission: FormPermission, method: string, input: Record<string, unknown> = {}) => {
    if (!ctx.hasPermission(permission)) denied(permission);
    const fn = ctx.service[method]; if (typeof fn !== "function") throw new Error(`Serviço de formulários indisponível: ${method}`);
    const { tenantId: _untrustedTenant, ...safeInput } = input as any;
    return fn({ ...safeInput, tenantId: ctx.tenantId, actorUserId: ctx.userId });
  };
  return {
    list: (input: Record<string, unknown> = {}) => call("forms.view", "list", input),
    get: (input: Record<string, unknown>) => call("forms.view", "get", input),
    createDraft: (input: Record<string, unknown>) => call("forms.create", "createDraft", input),
    updateDraft: (input: Record<string, unknown>) => call("forms.edit", "updateDraft", input),
    publish: (input: Record<string, unknown>) => call("forms.publish", "publish", input),
    disable: (input: Record<string, unknown>) => call("forms.disable", "disable", input),
    bind: (input: Record<string, unknown>) => call("forms.manage", "bind", input),
    startSubmission: (input: Record<string, unknown>) => call("forms.fill", "startSubmission", input),
    submit: (input: Record<string, unknown>) => call("forms.fill", "submit", input),
    correct: (input: Record<string, unknown>) => call("forms.responses.correct", "correct", input),
    forIncident: (input: Record<string, unknown>) => call("forms.responses.view", "forIncident", input),
    uploadAttachment: (input: Record<string, unknown>) => call("forms.fill", "uploadAttachment", input),
  };
}
