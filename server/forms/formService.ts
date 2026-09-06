import { validateFormAnswers, type FormAnswers } from "../../shared/forms";
import { assertDraftVersionEditable } from "./formDomain";
import { buildFormDomainEvent, type FormDomainEvent } from "./formEvents";

export type FormServiceRepository = {
  getTemplate(id: number): Promise<{ id: number; tenantId: number; status: "draft" | "published" | "inactive" } | null>;
  getVersion(id: number): Promise<{ id: number; tenantId: number; formId: number; version: number; status: "draft" | "published" | "superseded"; definition?: unknown } | null>;
  publishVersion(input: { versionId: number; actorUserId: number; publishedAt: Date }): Promise<unknown>;
  createSubmission(input: { formId: number; formVersionId: number; createdByUserId: number; answers: FormAnswers }): Promise<any>;
  appendRevision(input: { submissionId: number; revision: number; answers: FormAnswers; reason: string; actorUserId: number }): Promise<any>;
};

export type FormAuditEntry = {
  tenantId: number;
  resourceType: "form_template" | "form_version" | "form_submission";
  resourceId: string;
  action: string;
  actorUserId: number;
  occurredAt: Date;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export type FormServicePorts = {
  repository: FormServiceRepository;
  audit: { append(entry: FormAuditEntry): Promise<void> };
  events: { append(event: FormDomainEvent): Promise<void> };
};

export function createFormService(tenantId: number, ports: FormServicePorts) {
  async function publishFormVersion(input: { versionId: number; actorUserId: number; now: Date }) {
    const version = await ports.repository.getVersion(input.versionId);
    if (!version) throw new Error("Versão do formulário não encontrada.");
    if (version.tenantId !== tenantId) throw new Error("Versão pertence a outro tenant.");
    assertDraftVersionEditable(version.status);
    await ports.repository.publishVersion({ versionId: version.id, actorUserId: input.actorUserId, publishedAt: input.now });
    await ports.audit.append({ tenantId, resourceType: "form_version", resourceId: String(version.id), action: "publish", actorUserId: input.actorUserId, occurredAt: input.now, before: { status: version.status }, after: { status: "published" } });
    const event = buildFormDomainEvent({ eventType: "form.published", tenantId, aggregateType: "form", aggregateId: String(version.formId), occurredAt: input.now, actorUserId: input.actorUserId, payload: { versionId: version.id, version: version.version } });
    await ports.events.append(event);
    return { versionId: version.id, status: "published" as const };
  }

  async function submitForm(input: { formId: number; formVersionId: number; actorUserId: number; answers: FormAnswers; now: Date }) {
    const version = await ports.repository.getVersion(input.formVersionId);
    if (!version) throw new Error("Versão do formulário não encontrada.");
    if (version.tenantId !== tenantId) throw new Error("Versão pertence a outro tenant.");
    if (version.formId !== input.formId) throw new Error("Versão não pertence ao formulário informado.");
    if (version.status !== "published") throw new Error("Somente versões publicadas podem receber submissões.");

    const validation = validateFormAnswers(version.definition, input.answers);
    if (!validation.success) {
      const details = validation.issues.map(issue => issue.message).join("; ");
      throw new Error(`Respostas inválidas do formulário: ${details}`);
    }

    const created = await ports.repository.createSubmission({ formId: input.formId, formVersionId: input.formVersionId, createdByUserId: input.actorUserId, answers: validation.data });
    const submissionId = String(created?.id ?? "unknown");
    await ports.audit.append({ tenantId, resourceType: "form_submission", resourceId: submissionId, action: "submit", actorUserId: input.actorUserId, occurredAt: input.now, after: { formId: input.formId, formVersionId: input.formVersionId } });
    await ports.events.append(buildFormDomainEvent({ eventType: "submission.submitted", tenantId, aggregateType: "submission", aggregateId: submissionId, occurredAt: input.now, actorUserId: input.actorUserId, payload: { formId: input.formId, formVersionId: input.formVersionId } }));
    return { submissionId, incidentTransitionRequested: false as const };
  }

  return { publishFormVersion, submitForm };
}