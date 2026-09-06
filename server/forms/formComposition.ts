import { createFormRepository, type FormRepositoryAdapter } from "./formRepository";
import { createFormService, type FormAuditEntry } from "./formService";

export type FormsCompositionInput = {
  tenantId: number;
  persistence: FormRepositoryAdapter;
  audit: { append(entry: FormAuditEntry): Promise<void> };
};

export function createFormsComposition(input: FormsCompositionInput) {
  if (!Number.isInteger(input.tenantId) || input.tenantId <= 0) throw new Error("Tenant válido é obrigatório para compor o módulo de formulários.");

  const repository = createFormRepository(input.tenantId, input.persistence);
  const events = {
    append: async (event: Parameters<typeof repository.appendDomainEvent>[0] & { tenantId: number }) => {
      if (event.tenantId !== input.tenantId) throw new Error("Evento de formulário pertence a outro tenant.");
      const { tenantId: _serviceTenant, ...outboxEvent } = event;
      await repository.appendDomainEvent(outboxEvent);
    },
  };
  const audit = {
    append: async (entry: FormAuditEntry) => {
      if (entry.tenantId !== input.tenantId) throw new Error("Auditoria de formulário pertence a outro tenant.");
      await input.audit.append(entry);
    },
  };
  const service = createFormService(input.tenantId, { repository, audit, events });

  return { tenantId: input.tenantId, repository, service, audit, events };
}
