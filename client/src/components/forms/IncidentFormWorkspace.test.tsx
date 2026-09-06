// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { FormSchemaDefinition } from "@shared/forms";
import { IncidentFormWorkspace } from "./IncidentFormWorkspace";

const definition: FormSchemaDefinition = {
  schemaVersion: 1,
  title: "Vistoria operacional",
  fields: [{ id: "notes", key: "notes", label: "Observações", type: "short_text", required: true }],
};

const base = {
  incidentId: "88",
  formId: 3,
  formVersionId: 5,
  formName: "Vistoria",
  definition,
} as const;

describe("D-008 operational form workspace", () => {
  it("inicia e envia formulário vinculado à ocorrência sem solicitar transição operacional", async () => {
    const onStart = vi.fn(async () => ({ submissionId: "21", status: "in_progress" as const, incidentTransitionRequested: false as const }));
    const onSubmit = vi.fn(async () => ({ submissionId: "22", status: "submitted" as const, incidentTransitionRequested: false as const }));
    render(<IncidentFormWorkspace {...base} state="not_started" onStart={onStart} onSubmit={onSubmit} onCorrect={vi.fn()} />);

    expect(screen.getByLabelText("Observações *")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /iniciar preenchimento/i }));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith({ formId: 3, formVersionId: 5, contextType: "incident", contextId: "88" }));

    const notes = screen.getByLabelText("Observações *");
    expect(notes).not.toBeDisabled();
    fireEvent.change(notes, { target: { value: "Condição verificada" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar formulário/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ formId: 3, formVersionId: 5, contextType: "incident", contextId: "88", answers: { notes: "Condição verificada" } }));
    expect(screen.getByText(/não altera automaticamente o status da ocorrência/i)).toBeTruthy();
  });

  it("mantém enviado somente leitura até correção explícita com motivo", async () => {
    const onCorrect = vi.fn(async () => ({ status: "corrected" as const, revision: 2 }));
    render(<IncidentFormWorkspace {...base} state="submitted" submissionId={21} initialAnswers={{ notes: "Antes" }} onStart={vi.fn()} onSubmit={vi.fn()} onCorrect={onCorrect} />);

    expect(screen.getByLabelText("Observações *")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /corrigir resposta/i }));
    fireEvent.change(screen.getByLabelText("Observações *"), { target: { value: "Depois" } });
    fireEvent.change(screen.getByLabelText(/motivo da correção/i), { target: { value: "Ajuste após conferência de campo" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar correção/i }));

    await waitFor(() => expect(onCorrect).toHaveBeenCalledWith({ submissionId: 21, answers: { notes: "Depois" }, reason: "Ajuste após conferência de campo" }));
  });

  it("não permite correção sem motivo", async () => {
    const onCorrect = vi.fn();
    render(<IncidentFormWorkspace {...base} state="corrected" submissionId={21} initialAnswers={{ notes: "Antes" }} onStart={vi.fn()} onSubmit={vi.fn()} onCorrect={onCorrect} />);
    fireEvent.click(screen.getByRole("button", { name: /corrigir resposta/i }));
    fireEvent.click(screen.getByRole("button", { name: /salvar correção/i }));
    expect(onCorrect).not.toHaveBeenCalled();
    expect(screen.getByText(/informe o motivo da correção/i)).toBeTruthy();
  });
});