import type { KanbanSortOrder } from "./kanbanQueue";

export type SavedKanbanView = {
  name: string;
  priority: "todas" | "baixa" | "media" | "alta" | "critica";
  search: string;
  sortOrder: KanbanSortOrder;
  teamFilter: string;
  openedFrom: string;
  openedThrough: string;
};
type KanbanViewStorage = Pick<Storage, "getItem" | "setItem">;
const MAX_VIEWS = 10;
const priorities = ["todas", "baixa", "media", "alta", "critica"];
const sortOrders = ["priority", "oldest", "newest", "stage-oldest"];

export function kanbanViewsStorageKey(userId: number, organizationId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(organizationId) || organizationId < 1)
    throw new Error("Usuário e empresa autorizada são obrigatórios para salvar visões.");
  return "dispatch.kanban.views.v1." + userId + "." + organizationId;
}

function validDate(value: unknown): value is string {
  if (value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function sanitizeKanbanView(input: unknown): SavedKanbanView | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const v = input as Record<string, unknown>;
  if (typeof v.name !== "string" || v.name.trim().length < 2 || v.name.trim().length > 60 ||
      typeof v.priority !== "string" || !priorities.includes(v.priority) ||
      typeof v.sortOrder !== "string" || !sortOrders.includes(v.sortOrder) ||
      typeof v.search !== "string" || v.search.length > 120 ||
      typeof v.teamFilter !== "string" || !/^(todas|[1-9]\d{0,9})$/.test(v.teamFilter) ||
      !validDate(v.openedFrom) || !validDate(v.openedThrough)) return null;
  if (v.openedFrom && v.openedThrough && v.openedFrom > v.openedThrough) return null;
  return {
    name: v.name.trim(),
    priority: v.priority as SavedKanbanView["priority"],
    search: v.search,
    sortOrder: v.sortOrder as KanbanSortOrder,
    teamFilter: v.teamFilter,
    openedFrom: v.openedFrom,
    openedThrough: v.openedThrough,
  };
}

/** Never use a global fallback key or store incident payloads. */
export function loadUserTenantKanbanViews(
  storage: KanbanViewStorage,
  userId: number,
  organizationId: number,
): SavedKanbanView[] {
  const key = kanbanViewsStorageKey(userId, organizationId);
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > 50_000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_VIEWS).map(sanitizeKanbanView).filter((v): v is SavedKanbanView => v !== null);
  } catch {
    return [];
  }
}

export function saveUserTenantKanbanView(
  storage: KanbanViewStorage,
  userId: number,
  organizationId: number,
  raw: SavedKanbanView,
): SavedKanbanView[] {
  const value = sanitizeKanbanView(raw);
  if (!value) throw new Error("Visão Kanban inválida.");
  const existing = loadUserTenantKanbanViews(storage, userId, organizationId);
  const filtered = existing.filter(item => item.name !== value.name);
  if (filtered.length >= MAX_VIEWS) throw new Error("Limite de dez visões atingido.");
  const next = [...filtered, value].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  storage.setItem(kanbanViewsStorageKey(userId, organizationId), JSON.stringify(next));
  return next;
}

export function deleteUserTenantKanbanView(
  storage: KanbanViewStorage,
  userId: number,
  organizationId: number,
  name: string,
): SavedKanbanView[] {
  const next = loadUserTenantKanbanViews(storage, userId, organizationId).filter(view => view.name !== name);
  storage.setItem(kanbanViewsStorageKey(userId, organizationId), JSON.stringify(next));
  return next;
}
