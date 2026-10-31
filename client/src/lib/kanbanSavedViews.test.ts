import { describe, expect, it } from "vitest";
import { deleteUserTenantKanbanView, kanbanViewsStorageKey, loadUserTenantKanbanViews, sanitizeKanbanView, saveUserTenantKanbanView, type SavedKanbanView } from "./kanbanSavedViews";

function storage() {
  const records = new Map<string, string>();
  return {
    getItem: (k: string) => records.get(k) ?? null,
    setItem: (k: string, v: string) => { records.set(k, v); },
  };
}
const view: SavedKanbanView = {
  name: "Fila prioritária", priority: "critica", search: "OCR", sortOrder: "stage-oldest",
  teamFilter: "todas", openedFrom: "2026-10-01", openedThrough: "2026-10-31",
};

describe("AXED-F019 — visões locais de Kanban isoladas por usuário e tenant", () => {
  it("separa chaves por usuário e organização e não lê um bucket compartilhado", () => {
    const db = storage();
    saveUserTenantKanbanView(db, 10, 20, view);
    expect(loadUserTenantKanbanViews(db, 10, 20)).toEqual([view]);
    expect(loadUserTenantKanbanViews(db, 10, 21)).toEqual([]);
    expect(loadUserTenantKanbanViews(db, 11, 20)).toEqual([]);
    expect(kanbanViewsStorageKey(10, 20)).not.toBe(kanbanViewsStorageKey(10, 21));
  });
  it("rejeita IDs inválidos e evita fallback global de identidade", () => {
    expect(() => kanbanViewsStorageKey(0, 20)).toThrow();
    expect(() => kanbanViewsStorageKey(10, 0)).toThrow();
    expect(() => kanbanViewsStorageKey(1.2, 20)).toThrow();
  });
  it("salva e substitui pelo nome sem criar duplicatas", () => {
    const db = storage();
    saveUserTenantKanbanView(db, 10, 20, view);
    const next = saveUserTenantKanbanView(db, 10, 20, { ...view, search: "OCR-123" });
    expect(next).toHaveLength(1);
    expect(next[0].search).toBe("OCR-123");
  });
  it("exclui apenas a visão selecionada e somente do bucket ativo", () => {
    const db = storage();
    saveUserTenantKanbanView(db, 10, 20, view);
    saveUserTenantKanbanView(db, 10, 21, view);
    expect(deleteUserTenantKanbanView(db, 10, 20, view.name)).toEqual([]);
    expect(loadUserTenantKanbanViews(db, 10, 21)).toHaveLength(1);
  });
  it("não persiste payloads não permitidos nem objetos malformados", () => {
    expect(sanitizeKanbanView({ ...view, incident: { requesterContact: "secret" } })).toEqual(view);
    expect(sanitizeKanbanView({ ...view, name: "" })).toBeNull();
    expect(sanitizeKanbanView({ ...view, priority: "secret" })).toBeNull();
    expect(sanitizeKanbanView({ ...view, search: "x".repeat(121) })).toBeNull();
    expect(sanitizeKanbanView({ ...view, openedThrough: "2026-02-31" })).toBeNull();
    expect(sanitizeKanbanView({ ...view, openedFrom: "2026-11-01" })).toBeNull();
  });
  it("trata JSON corrompido e ignora itens inválidos sem quebrar a tela", () => {
    const db = storage();
    const key = kanbanViewsStorageKey(10, 20);
    db.setItem(key, "{broken");
    expect(loadUserTenantKanbanViews(db, 10, 20)).toEqual([]);
    db.setItem(key, JSON.stringify([view, { ...view, priority: "invalid" }]));
    expect(loadUserTenantKanbanViews(db, 10, 20)).toEqual([view]);
  });
  it("limita dez visões por bucket e não troca usuário quando o limite é atingido", () => {
    const db = storage();
    for (let i = 0; i < 10; i++) saveUserTenantKanbanView(db, 10, 20, { ...view, name: "Filtro " + i });
    expect(() => saveUserTenantKanbanView(db, 10, 20, { ...view, name: "Filtro 10" })).toThrow();
    expect(loadUserTenantKanbanViews(db, 10, 20)).toHaveLength(10);
    expect(loadUserTenantKanbanViews(db, 11, 20)).toEqual([]);
  });
});
