// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { activeSubmissionFor } from "./IncidentFormsOperationalDock";

describe("D-008 operational forms dock", () => {
  it("seleciona a submissão mais recente da versão vinculada", () => {
    const item = { id: 1, formId: 3, formVersionId: 5, contextId: "88", state: "corrected" as const };
    const selected = activeSubmissionFor(item, [
      { id: 20, formId: 3, formVersionId: 5, status: "submitted", revision: 1, answers: { notes: "Antes" } },
      { id: 21, formId: 3, formVersionId: 5, status: "corrected", revision: 2, answers: { notes: "Depois" } },
      { id: 99, formId: 4, formVersionId: 7, status: "submitted", revision: 9, answers: {} },
    ]);
    expect(selected).toEqual(expect.objectContaining({ id: 21, revision: 2, answers: { notes: "Depois" } }));
  });

  it("usa id como desempate enquanto o backend não hidrata revisão da listagem", () => {
    const item = { id: 1, formId: 3, formVersionId: 5, contextId: "88", state: "submitted" as const };
    expect(activeSubmissionFor(item, [
      { id: 20, formId: 3, formVersionId: 5, status: "in_progress" },
      { id: 22, formId: 3, formVersionId: 5, status: "submitted" },
    ])?.id).toBe(22);
  });
});
