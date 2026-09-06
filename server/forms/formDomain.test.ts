import { describe, expect, it } from "vitest";
import {
  FormDomainError,
  assertDraftVersionEditable,
  buildPublishedVersion,
  buildSubmissionRevision,
  nextVersionNumber,
} from "./formDomain";

const schema = {
  schemaVersion: 1,
  title: "Inspeção de campo",
  fields: [{ id: "f1", key: "observacao", type: "short_text", label: "Observação", required: true }],
} as const;

describe("D-008 publication invariants", () => {
  it("permite editar somente versão draft", () => {
    expect(() => assertDraftVersionEditable("draft")).not.toThrow();
    expect(() => assertDraftVersionEditable("published")).toThrowError(FormDomainError);
    expect(() => assertDraftVersionEditable("retired")).toThrowError(FormDomainError);
  });

  it("incrementa a versão monotonicamente", () => {
    expect(nextVersionNumber([])).toBe(1);
    expect(nextVersionNumber([1, 2, 4])).toBe(5);
  });

  it("publica snapshot independente do objeto draft", () => {
    const published = buildPublishedVersion({ formId: 7, version: 2, definition: schema }, 11, new Date("2026-09-05T12:00:00Z"));
    expect(published.status).toBe("published");
    expect(published.publishedByUserId).toBe(11);
    expect(published.definition).not.toBe(schema);
    expect(published.definition).toEqual(schema);
  });
});

describe("D-008 correction invariants", () => {
  const current = { submissionId: 31, formVersionId: 9, revision: 1, answers: { observacao: "antes" } };

  it("exige motivo auditável para correção", () => {
    expect(() => buildSubmissionRevision(current, { observacao: "depois" }, "  ", 15, new Date())).toThrowError(FormDomainError);
  });

  it("cria nova revisão sem alterar a submissão original", () => {
    const revision = buildSubmissionRevision(current, { observacao: "depois" }, "Correção do agente", 15, new Date("2026-09-05T13:00:00Z"));
    expect(current.answers).toEqual({ observacao: "antes" });
    expect(revision.revision).toBe(2);
    expect(revision.submissionId).toBe(31);
    expect(revision.formVersionId).toBe(9);
    expect(revision.answers).toEqual({ observacao: "depois" });
    expect(revision.reason).toBe("Correção do agente");
  });
});
