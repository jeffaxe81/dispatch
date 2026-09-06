// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IncidentFormWorkspace } from "./IncidentFormWorkspace";

const definition = {
  schemaVersion: 1 as const,
  title: "Vistoria",
  fields: [
    { id: "notes", key: "notes", label: "Observações", type: "short_text" as const, required: false },
    { id: "foto", key: "foto", label: "Foto", type: "image" as const, required: false },
  ],
};

describe("D-008 correction attachment UX", () => {
  it("mantém correção textual editável, mas bloqueia anexos até existir revisão de anexo validada", () => {
    render(
      <IncidentFormWorkspace
        incidentId="88"
        formId={3}
        formVersionId={5}
        formName="Vistoria"
        definition={definition}
        state="submitted"
        submissionId={21}
        initialAnswers={{ notes: "Antes", foto: "foto.png" }}
        canFill
        canCorrect
        onStart={vi.fn(async () => ({ submissionId: 21 }))}
        onSubmit={vi.fn(async () => ({ submissionId: 21 }))}
        onCorrect={vi.fn(async () => undefined)}
        onUploadAttachment={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Corrigir resposta/i }));

    const notes = screen.getByLabelText("Observações") as HTMLInputElement;
    const file = screen.getByLabelText("Foto") as HTMLInputElement;
    expect(notes.readOnly).toBe(false);
    expect(file.disabled).toBe(true);
  });
});
