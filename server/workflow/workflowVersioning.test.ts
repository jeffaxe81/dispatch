import { describe, expect, it } from "vitest";
import {
  disableWorkflowPublication,
  nextWorkflowDraftVersion,
  projectWorkflowPublicationState,
  publishCurrentWorkflowVersion,
  resolvePublishedWorkflowVersion,
} from "./workflowVersioning";

describe("D-012B workflow definition/version publication", () => {
  it("mantém workflow inicial somente em rascunho antes da primeira publicação", () => {
    const state = { currentVersion: 1, publishedVersion: null, active: false } as const;

    expect(projectWorkflowPublicationState(state)).toEqual({
      lifecycle: "draft",
      hasDraftChanges: true,
    });
    expect(resolvePublishedWorkflowVersion(state)).toBeNull();
  });

  it("cria nova versão de rascunho sem mover a versão publicada", () => {
    const state = { currentVersion: 1, publishedVersion: 1, active: true } as const;

    const next = nextWorkflowDraftVersion(state);

    expect(next).toEqual({ currentVersion: 2, publishedVersion: 1, active: true });
    expect(projectWorkflowPublicationState(next)).toEqual({
      lifecycle: "published",
      hasDraftChanges: true,
    });
    expect(resolvePublishedWorkflowVersion(next)).toBe(1);
  });

  it("publica explicitamente somente a versão corrente", () => {
    const state = { currentVersion: 3, publishedVersion: 1, active: true } as const;

    const published = publishCurrentWorkflowVersion(state);

    expect(published).toEqual({ currentVersion: 3, publishedVersion: 3, active: true });
    expect(projectWorkflowPublicationState(published)).toEqual({
      lifecycle: "published",
      hasDraftChanges: false,
    });
    expect(resolvePublishedWorkflowVersion(published)).toBe(3);
  });

  it("desativa sem apagar qual versão foi publicada", () => {
    const state = { currentVersion: 2, publishedVersion: 2, active: true } as const;

    const disabled = disableWorkflowPublication(state);

    expect(disabled).toEqual({ currentVersion: 2, publishedVersion: 2, active: false });
    expect(projectWorkflowPublicationState(disabled)).toEqual({
      lifecycle: "disabled",
      hasDraftChanges: false,
    });
    expect(resolvePublishedWorkflowVersion(disabled)).toBeNull();
  });

  it("nunca entrega rascunho ao executor quando há publicação anterior", () => {
    const state = { currentVersion: 5, publishedVersion: 4, active: true } as const;

    expect(resolvePublishedWorkflowVersion(state)).toBe(4);
  });

  it("falha fechado para estado impossível em que publicação supera a versão corrente", () => {
    const state = { currentVersion: 2, publishedVersion: 3, active: true } as const;

    expect(() => projectWorkflowPublicationState(state)).toThrow(/publishedVersion/i);
    expect(() => resolvePublishedWorkflowVersion(state)).toThrow(/publishedVersion/i);
  });
});
