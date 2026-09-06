// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { FormSchemaDefinition } from "@shared/forms";
import { IncidentFormWorkspace } from "./IncidentFormWorkspace";

const definition: FormSchemaDefinition = {
  schemaVersion: 1,
  title: "Evidência",
  fields: [{ id: "photo", key: "photo", label: "Foto", type: "image", required: true }],
};

const base = {
  incidentId: "88",
  formId: 3,
  formVersionId: 5,
  formName: "Evidência",
  definition,
  state: "in_progress" as const,
  submissionId: 21,
};

describe("D-008 operational attachment lifecycle", () => {
  it("só inclui o nome do anexo nas respostas depois de upload bem-sucedido", async () => {
    const onUploadAttachment = vi.fn(async () => ({ storageKey: "stored" }));
    const onSubmit = vi.fn(async () => ({ submissionId: "21", status: "submitted" }));
    render(<IncidentFormWorkspace {...base} onStart={vi.fn()} onSubmit={onSubmit} onCorrect={vi.fn()} onUploadAttachment={onUploadAttachment} />);
    const file = new File(["png"], "foto.png", { type: "image/png" });

    fireEvent.change(screen.getByLabelText("Foto *"), { target: { files: [file] } });
    await waitFor(() => expect(onUploadAttachment).toHaveBeenCalledWith({ submissionId: 21, fieldKey: "photo", kind: "image", file }));
    await waitFor(() => expect(screen.getByRole("button", { name: /enviar formulário/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /enviar formulário/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ submissionId: 21, answers: { photo: "foto.png" } })));
  });

  it("não confirma o answer quando o upload falha", async () => {
    const onUploadAttachment = vi.fn(async () => { throw new Error("storage indisponível"); });
    const onSubmit = vi.fn(async () => ({ submissionId: "21", status: "submitted" }));
    render(<IncidentFormWorkspace {...base} onStart={vi.fn()} onSubmit={onSubmit} onCorrect={vi.fn()} onUploadAttachment={onUploadAttachment} />);
    const file = new File(["png"], "foto.png", { type: "image/png" });

    fireEvent.change(screen.getByLabelText("Foto *"), { target: { files: [file] } });
    await screen.findByText(/storage indisponível/i);
    fireEvent.click(screen.getByRole("button", { name: /enviar formulário/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ submissionId: 21, answers: {} })));
  });
});
