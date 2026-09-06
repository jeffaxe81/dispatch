import type { FormAnswers, FormSchemaDefinition } from "../../shared/forms";
import { assertFormTenantScope } from "./formAccess";

export type FormTemplateSnapshot = { id: number; tenantId: number; status: "draft" | "published" | "inactive" };
export type FormVersionSnapshot = { id: number; tenantId: number; formId: number; version: number; status: "draft" | "published" | "superseded"; definition?: FormSchemaDefinition };

export type FormRepositoryAdapter = {
  getTemplate(input: { tenantId: number; id: number }): Promise<FormTemplateSnapshot | null>;
  listTemplates(input: { tenantId: number }): Promise<FormTemplateSnapshot[]>;
  getVersion(input: { tenantId: number; id: number }): Promise<FormVersionSnapshot | null>;
  listVersions(input: { tenantId: number; formId: number }): Promise<FormVersionSnapshot[]>;
  createDraft(input: { tenantId: number; code: string; name: string; createdByUserId: number }): Promise<unknown>;
  saveDraft(input: { tenantId: number; versionId: number; definition: FormSchemaDefinition; actorUserId: number }): Promise<unknown>;
  publishVersion(input: { tenantId: number; versionId: number; actorUserId: number; publishedAt: Date }): Promise<unknown>;
  createSubmission(input: { tenantId: number; formId: number; formVersionId: number; createdByUserId: number; answers: FormAnswers }): Promise<unknown>;
  appendRevision(input: { tenantId: number; submissionId: number; revision: number; answers: FormAnswers; reason: string; actorUserId: number }): Promise<unknown>;
  listBindings(input: { tenantId: number; contextType?: string; contextId?: string }): Promise<unknown[]>;
  listSubmissionsForIncident(input: { tenantId: number; incidentId: string }): Promise<unknown[]>;
};

function assertOwned<T extends { tenantId: number }>(tenantId: number, resource: T | null): T | null {
  if (resource) assertFormTenantScope(tenantId, resource.tenantId);
  return resource;
}

function assertOwnedList<T extends { tenantId: number }>(tenantId: number, resources: T[]): T[] {
  for (const resource of resources) assertFormTenantScope(tenantId, resource.tenantId);
  return resources;
}

export function createFormRepository(tenantId: number, adapter: FormRepositoryAdapter) {
  return {
    async getTemplate(id: number) {
      return assertOwned(tenantId, await adapter.getTemplate({ tenantId, id }));
    },
    async listTemplates() {
      return assertOwnedList(tenantId, await adapter.listTemplates({ tenantId }));
    },
    async getVersion(id: number) {
      return assertOwned(tenantId, await adapter.getVersion({ tenantId, id }));
    },
    async listVersions(formId: number) {
      return assertOwnedList(tenantId, await adapter.listVersions({ tenantId, formId }));
    },
    createDraft(input: { code: string; name: string; createdByUserId: number }) {
      return adapter.createDraft({ tenantId, ...input });
    },
    saveDraft(input: { versionId: number; definition: FormSchemaDefinition; actorUserId: number }) {
      return adapter.saveDraft({ tenantId, ...input });
    },
    publishVersion(input: { versionId: number; actorUserId: number; publishedAt: Date }) {
      return adapter.publishVersion({ tenantId, ...input });
    },
    createSubmission(input: { formId: number; formVersionId: number; createdByUserId: number; answers: FormAnswers }) {
      return adapter.createSubmission({ tenantId, ...input });
    },
    appendRevision(input: { submissionId: number; revision: number; answers: FormAnswers; reason: string; actorUserId: number }) {
      return adapter.appendRevision({ tenantId, ...input });
    },
    listBindings(input: { contextType?: string; contextId?: string } = {}) {
      return adapter.listBindings({ tenantId, ...input });
    },
    listSubmissionsForIncident(incidentId: string) {
      return adapter.listSubmissionsForIncident({ tenantId, incidentId });
    },
  };
}

export type FormRepository = ReturnType<typeof createFormRepository>;
