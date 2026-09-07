import { describe, expect, it } from "vitest";
import { resolvePublishedWorkspaceForm } from "./DynamicFormWidget";

const published = {
  id: 10,
  name: "Vistoria",
  versionId: 22,
  version: 3,
  versionStatus: "published",
  definition: { schemaVersion: 1, title: "Vistoria", fields: [] },
};

describe("D-010C DynamicFormWidget", () => {
  it("aceita somente o formId solicitado quando a versão está publicada", () => {
    expect(resolvePublishedWorkspaceForm(published, 10)).toEqual({
      id: 10,
      name: "Vistoria",
      versionId: 22,
      version: 3,
      definition: published.definition,
    });
  });

  it("não expõe detalhes de formulário ausente, divergente ou não publicado", () => {
    expect(resolvePublishedWorkspaceForm({ ...published, versionStatus: "draft" }, 10)).toBeNull();
    expect(resolvePublishedWorkspaceForm(published, 999)).toBeNull();
    expect(resolvePublishedWorkspaceForm(null, 10)).toBeNull();
  });
});
