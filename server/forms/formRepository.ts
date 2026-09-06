import type { FormAnswers, FormSchemaDefinition } from "../../shared/forms";
import { assertFormTenantScope } from "./formAccess";
import type { FormEventType } from "./formEvents";

export type FormTemplateSnapshot = { id: number; tenantId: number; status: "draft" | "active" | "disabled" };
export type FormVersionSnapshot = { id: number; tenantId: number; formId: number; version: number; status: "draft" | "published" | "retired"; definition?: FormSchemaDefinition };
export type FormSubmissionSnapshot = { id: number; tenantId: number; formId: number; formVersionId: number; revision: number; status: "in_progress" | "submitted" | "corrected"; answers: FormAnswers };
export type FormContextType = "incident_category" | "incident" | "field_activity";
export type FormAttachmentKind = "image" | "file" | "simple_signature";

export type FormRepositoryAdapter = {
  getTemplate(input: { tenantId: number; id: number }): Promise<FormTemplateSnapshot | null>;
  listTemplates(input: { tenantId: number }): Promise<FormTemplateSnapshot[]>;
  getVersion(input: { tenantId: number; id: number }): Promise<FormVersionSnapshot | null>;
  listVersions(input: { tenantId: number; formId: number }): Promise<FormVersionSnapshot[]>;
  getSubmission(input: { tenantId: number; id: number }): Promise<FormSubmissionSnapshot | null>;
  createDraft(input: { tenantId: number; code: string; name: string; createdByUserId: number }): Promise<unknown>;
  saveDraft(input: { tenantId: number; versionId: number; definition: FormSchemaDefinition; actorUserId: number }): Promise<unknown>;
  publishVersion(input: { tenantId: number; versionId: number; actorUserId: number; publishedAt: Date }): Promise<unknown>;
  activateForm(input: { tenantId: number; formId: number; actorUserId: number; activatedAt: Date }): Promise<unknown>;
  disableForm(input: { tenantId: number; formId: number; actorUserId: number; disabledAt: Date }): Promise<unknown>;
  createBinding(input: { tenantId: number; formId: number; formVersionId: number; contextType: FormContextType; contextId: string; createdByUserId: number }): Promise<unknown>;
  createSubmission(input: { tenantId: number; formId: number; formVersionId: number; createdByUserId: number; status: "submitted"; answers: FormAnswers }): Promise<unknown>;
  appendRevision(input: { tenantId: number; submissionId: number; revision: number; answers: FormAnswers; reason: string; actorUserId: number; submissionStatus: "corrected" }): Promise<unknown>;
  createAttachment(input: { tenantId: number; submissionId: number; revisionId?: number | null; fieldKey: string; kind: FormAttachmentKind; storageKey: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string; createdByUserId: number }): Promise<unknown>;
  appendDomainEvent(input: { tenantId: number; eventId: string; eventType: FormEventType; aggregateType: "form" | "submission"; aggregateId: string; actorUserId: number; payload: Record<string, unknown>; occurredAt: Date }): Promise<unknown>;
  listBindings(input: { tenantId: number; contextType?: FormContextType; contextId?: string }): Promise<unknown[]>;
  listSubmissionsForIncident(input: { tenantId: number; incidentId: string }): Promise<unknown[]>;
};

function assertOwned<T extends { tenantId: number }>(tenantId: number, resource: T | null): T | null { if (resource) assertFormTenantScope(tenantId, resource.tenantId); return resource; }
function assertOwnedList<T extends { tenantId: number }>(tenantId: number, resources: T[]): T[] { for (const resource of resources) assertFormTenantScope(tenantId, resource.tenantId); return resources; }

export function createFormRepository(tenantId: number, adapter: FormRepositoryAdapter) {
  return {
    async getTemplate(id: number) { return assertOwned(tenantId, await adapter.getTemplate({ tenantId, id })); },
    async listTemplates() { return assertOwnedList(tenantId, await adapter.listTemplates({ tenantId })); },
    async getVersion(id: number) { return assertOwned(tenantId, await adapter.getVersion({ tenantId, id })); },
    async listVersions(formId: number) { return assertOwnedList(tenantId, await adapter.listVersions({ tenantId, formId })); },
    async getSubmission(id: number) { return assertOwned(tenantId, await adapter.getSubmission({ tenantId, id })); },
    createDraft(input: { code: string; name: string; createdByUserId: number }) { return adapter.createDraft({ tenantId, ...input }); },
    saveDraft(input: { versionId: number; definition: FormSchemaDefinition; actorUserId: number }) { return adapter.saveDraft({ tenantId, ...input }); },
    publishVersion(input: { versionId: number; actorUserId: number; publishedAt: Date }) { return adapter.publishVersion({ tenantId, ...input }); },
    activateForm(input: { formId: number; actorUserId: number; activatedAt: Date }) { return adapter.activateForm({ tenantId, ...input }); },
    disableForm(input: { formId: number; actorUserId: number; disabledAt: Date }) { return adapter.disableForm({ tenantId, ...input }); },
    bindForm(input: { formId: number; formVersionId: number; contextType: FormContextType; contextId: string; actorUserId: number }) { const { actorUserId, ...binding } = input; return adapter.createBinding({ tenantId, ...binding, createdByUserId: actorUserId }); },
    createSubmission(input: { formId: number; formVersionId: number; createdByUserId: number; status: "submitted"; answers: FormAnswers }) { return adapter.createSubmission({ tenantId, ...input }); },
    appendRevision(input: { submissionId: number; revision: number; answers: FormAnswers; reason: string; actorUserId: number; submissionStatus: "corrected" }) { return adapter.appendRevision({ tenantId, ...input }); },
    createAttachment(input: { submissionId: number; revisionId?: number | null; fieldKey: string; kind: FormAttachmentKind; storageKey: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string; createdByUserId: number }) { return adapter.createAttachment({ tenantId, ...input }); },
    appendDomainEvent(input: { eventId: string; eventType: FormEventType; aggregateType: "form" | "submission"; aggregateId: string; actorUserId: number; payload: Record<string, unknown>; occurredAt: Date }) { return adapter.appendDomainEvent({ tenantId, ...input }); },
    listBindings(input: { contextType?: FormContextType; contextId?: string } = {}) { return adapter.listBindings({ tenantId, ...input }); },
    listSubmissionsForIncident(incidentId: string) { return adapter.listSubmissionsForIncident({ tenantId, incidentId }); },
  };
}

export type FormRepository = ReturnType<typeof createFormRepository>;
