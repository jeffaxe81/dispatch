// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { FormSchemaDefinition } from "@shared/forms";
import { FormRenderer } from "./FormRenderer";

const definition: FormSchemaDefinition = {
  schemaVersion: 1,
  title: "Evidência",
  fields: [{ id: "photo", key: "photo", label: "Foto", type: "image", required: true }],
};

describe("D-008 attachment selection lifecycle", () => {
  it("delega o arquivo ao upload sem confirmar o nome no answer antecipadamente", () => {
    const onChange = vi.fn();
    const onAttachmentSelected = vi.fn();
    render(<FormRenderer definition={definition} values={{}} onChange={onChange} onAttachmentSelected={onAttachmentSelected} />);
    const file = new File(["png"], "foto.png", { type: "image/png" });

    fireEvent.change(screen.getByLabelText("Foto *"), { target: { files: [file] } });

    expect(onAttachmentSelected).toHaveBeenCalledWith("photo", file, "image");
    expect(onChange).not.toHaveBeenCalledWith("photo", "foto.png");
  });

  it("mantém fallback local quando não existe callback de upload", () => {
    const onChange = vi.fn();
    render(<FormRenderer definition={definition} values={{}} onChange={onChange} />);
    const file = new File(["png"], "foto.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Foto *"), { target: { files: [file] } });
    expect(onChange).toHaveBeenCalledWith("photo", "foto.png");
  });
});
