import { describe, expect, it } from "vitest";
import {
  formAttachments,
  formBindings,
  formDomainEvents,
  formSubmissionRevisions,
  formSubmissions,
  formVersions,
  forms,
} from "../../drizzle/formsSchema";

const tableName = (table: unknown) => (table as { [key: symbol]: unknown })[Symbol.for("drizzle:Name")];

describe("D-008 Drizzle schema", () => {
  it("expõe as sete tabelas centrais do motor de formulários", () => {
    expect(tableName(forms)).toBe("forms");
    expect(tableName(formVersions)).toBe("form_versions");
    expect(tableName(formBindings)).toBe("form_bindings");
    expect(tableName(formSubmissions)).toBe("form_submissions");
    expect(tableName(formSubmissionRevisions)).toBe("form_submission_revisions");
    expect(tableName(formAttachments)).toBe("form_attachments");
    expect(tableName(formDomainEvents)).toBe("form_domain_events");
  });

  it("mantém a versão publicada separada das respostas operacionais", () => {
    expect(formVersions.definition).toBeDefined();
    expect(formVersions.definitionHash).toBeDefined();
    expect(formSubmissions.formVersionId).toBeDefined();
    expect(formSubmissions.answers).toBeDefined();
  });

  it("mantém tenant e histórico de correção como campos de primeira classe", () => {
    expect(forms.tenantId).toBeDefined();
    expect(formBindings.tenantId).toBeDefined();
    expect(formSubmissions.tenantId).toBeDefined();
    expect(formSubmissionRevisions.tenantId).toBeDefined();
    expect(formDomainEvents.tenantId).toBeDefined();
    expect(formSubmissionRevisions.reason).toBeDefined();
  });

  it("modela bindings desacoplados e outbox retryable", () => {
    expect(formBindings.contextType).toBeDefined();
    expect(formBindings.contextId).toBeDefined();
    expect(formDomainEvents.deliveryStatus).toBeDefined();
    expect(formDomainEvents.attemptCount).toBeDefined();
    expect(formDomainEvents.nextAttemptAt).toBeDefined();
  });
});
