import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formAttachments,
  formBindings,
  formDomainEvents,
  formSubmissionRevisions,
  formSubmissions,
  formTemplates,
  formVersions,
} from "../../drizzle/formsSchema";

const tableName = (table: unknown) => (table as { [key: symbol]: unknown })[Symbol.for("drizzle:Name")];

describe("D-008 Drizzle schema", () => {
  it("expõe exatamente as sete tabelas centrais aprovadas", () => {
    expect(tableName(formTemplates)).toBe("form_templates");
    expect(tableName(formVersions)).toBe("form_versions");
    expect(tableName(formBindings)).toBe("form_bindings");
    expect(tableName(formSubmissions)).toBe("form_submissions");
    expect(tableName(formSubmissionRevisions)).toBe("form_submission_revisions");
    expect(tableName(formAttachments)).toBe("form_attachments");
    expect(tableName(formDomainEvents)).toBe("form_domain_events");
  });

  it("mantém versão, respostas e tenant como primeira classe", () => {
    expect(formVersions.definition).toBeDefined();
    expect(formVersions.definitionHash).toBeDefined();
    expect(formSubmissions.formVersionId).toBeDefined();
    expect(formSubmissions.answers).toBeDefined();
    expect(formTemplates.tenantId).toBeDefined();
    expect(formSubmissionRevisions.tenantId).toBeDefined();
  });

  it("modela correção, anexos tipados e hash obrigatório no schema", () => {
    expect(formSubmissionRevisions.reason).toBeDefined();
    expect(formAttachments.kind).toBeDefined();
    expect(formAttachments.sha256).toBeDefined();
    expect(formAttachments.sha256.notNull).toBe(true);
  });

  it("modela bindings desacoplados e outbox retryable", () => {
    expect(formBindings.contextType).toBeDefined();
    expect(formBindings.contextId).toBeDefined();
    expect(formDomainEvents.deliveryStatus).toBeDefined();
    expect(formDomainEvents.attemptCount).toBeDefined();
    expect(formDomainEvents.nextAttemptAt).toBeDefined();
  });

  it("usa nos enums os mesmos nomes de coluna da migration MySQL", () => {
    const source = readFileSync(new URL("../../drizzle/formsSchema.ts", import.meta.url), "utf8");
    expect(source).toContain('status: mysqlEnum("status", ["draft", "active", "disabled"])');
    expect(source).toContain('contextType: mysqlEnum("context_type", ["incident_category", "incident", "field_activity"])');
    expect(source).toContain('kind: mysqlEnum("kind", ["image", "file", "simple_signature"])');
    expect(source).toContain('deliveryStatus: mysqlEnum("delivery_status", ["pending", "published", "failed"])');
    expect(source).not.toContain('mysqlEnum("form_status"');
    expect(source).not.toContain('mysqlEnum("form_context_type"');
  });
});
