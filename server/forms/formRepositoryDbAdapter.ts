import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  formAttachments,
  formBindings,
  formDomainEvents,
  formSubmissionRevisions,
  formSubmissions,
  formTemplates,
  formVersions,
} from "../../drizzle/formsSchema";
import { getDb } from "../db";
import type { FormRepositoryAdapter } from "./formRepository";

type DbProvider = { getDb: typeof getDb };

function answersHash(answers: unknown): string {
  return createHash("sha256").update(JSON.stringify(answers)).digest("hex");
}

export function createFormRepositoryDbAdapter(provider: DbProvider = { getDb }): FormRepositoryAdapter {
  async function db() {
    const value = await provider.getDb();
    if (!value) throw new Error("Banco de dados indisponível para formulários.");
    return value;
  }

  return {
    async getTemplate(input) {
      const database = await db();
      const rows = await database.select().from(formTemplates).where(and(eq(formTemplates.tenantId, input.tenantId), eq(formTemplates.id, input.id))).limit(1);
      return (rows[0] as any) ?? null;
    },
    async listTemplates(input) {
      const database = await db();
      return database.select().from(formTemplates).where(eq(formTemplates.tenantId, input.tenantId)) as any;
    },
    async getVersion(input) {
      const database = await db();
      const rows = await database.select().from(formVersions).where(and(eq(formVersions.tenantId, input.tenantId), eq(formVersions.id, input.id))).limit(1);
      return (rows[0] as any) ?? null;
    },
    async listVersions(input) {
      const database = await db();
      return database.select().from(formVersions).where(and(eq(formVersions.tenantId, input.tenantId), eq(formVersions.formId, input.formId))) as any;
    },
    async getSubmission(input) {
      const database = await db();
      const rows = await database.select().from(formSubmissions).where(and(eq(formSubmissions.tenantId, input.tenantId), eq(formSubmissions.id, input.id))).limit(1);
      const row = rows[0] as any;
      if (!row) return null;
      const revisions = await database.select().from(formSubmissionRevisions).where(and(eq(formSubmissionRevisions.tenantId, input.tenantId), eq(formSubmissionRevisions.submissionId, input.id))) as any[];
      const revision = revisions.reduce((max, item) => Math.max(max, Number(item.revision ?? 0)), 1);
      return { ...row, revision };
    },
    async createDraft(input) {
      const database = await db();
      const result = await database.insert(formTemplates).values({ tenantId: input.tenantId, code: input.code, name: input.name, createdByUserId: input.createdByUserId }).$returningId();
      return result[0] ?? result;
    },
    async saveDraft(input) {
      const database = await db();
      await database.update(formVersions).set({ definition: input.definition }).where(and(eq(formVersions.tenantId, input.tenantId), eq(formVersions.id, input.versionId), eq(formVersions.status, "draft")));
      return { versionId: input.versionId };
    },
    async publishVersion(input) {
      const database = await db();
      await database.update(formVersions).set({ status: "published", publishedByUserId: input.actorUserId, publishedAt: input.publishedAt }).where(and(eq(formVersions.tenantId, input.tenantId), eq(formVersions.id, input.versionId), eq(formVersions.status, "draft")));
      return { versionId: input.versionId, status: "published" as const };
    },
    async activateForm(input) {
      const database = await db();
      await database.update(formTemplates).set({ status: "active" }).where(and(eq(formTemplates.tenantId, input.tenantId), eq(formTemplates.id, input.formId)));
      return { formId: input.formId, status: "active" as const };
    },
    async disableForm(input) {
      const database = await db();
      await database.update(formTemplates).set({ status: "disabled" }).where(and(eq(formTemplates.tenantId, input.tenantId), eq(formTemplates.id, input.formId)));
      return { formId: input.formId, status: "disabled" as const };
    },
    async createBinding(input) {
      const database = await db();
      const result = await database.insert(formBindings).values(input).$returningId();
      return result[0] ?? result;
    },
    async createSubmission(input) {
      const database = await db();
      const result = await database.insert(formSubmissions).values({ ...input, submittedByUserId: input.createdByUserId, submittedAt: new Date() }).$returningId();
      return result[0] ?? result;
    },
    async appendRevision(input) {
      const database = await db();
      const afterHash = answersHash(input.answers);
      const result = await database.insert(formSubmissionRevisions).values({ tenantId: input.tenantId, submissionId: input.submissionId, revision: input.revision, answers: input.answers, reason: input.reason, actorUserId: input.actorUserId, afterHash }).$returningId();
      await database.update(formSubmissions).set({ status: input.submissionStatus, answers: input.answers }).where(and(eq(formSubmissions.tenantId, input.tenantId), eq(formSubmissions.id, input.submissionId)));
      return result[0] ?? result;
    },
    async createAttachment(input) {
      const database = await db();
      const result = await database.insert(formAttachments).values(input).$returningId();
      return result[0] ?? result;
    },
    async appendDomainEvent(input) {
      const database = await db();
      const result = await database.insert(formDomainEvents).values(input).$returningId();
      return result[0] ?? result;
    },
    async listBindings(input) {
      const database = await db();
      return database.select().from(formBindings).where(eq(formBindings.tenantId, input.tenantId)) as any;
    },
    async listSubmissionsForIncident(input) {
      const database = await db();
      return database.select().from(formSubmissions).where(and(eq(formSubmissions.tenantId, input.tenantId), eq(formSubmissions.contextType, "incident"), eq(formSubmissions.contextId, input.incidentId))) as any;
    },
  };
}
