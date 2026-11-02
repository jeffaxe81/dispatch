/** F041/F042/F045: bounded offline read-only data for an authenticated field agent.
 * Stores no address, description, phone, coordinates, attachment or token.
 * F046 is a separate, explicit restore action; NEVER replay network writes.
 */
export const AGENT_OFFLINE_TTL_MS = 15 * 60 * 1000;
const PREFIX = "dispatch.offline.agent.v1.";
const VALID_STATUSES = new Set(["triagem", "aguardando_despacho", "despachada", "aceita", "em_atendimento", "pausada", "concluida", "cancelada"]);
const MAX_SNAPSHOT = 50;
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type AgentOfflineScope = { userId: number; organizationId: number; teamId: number };
export type AgentOfflineAssignment = { id: number; code: string; category: string; status: string };
type Envelope<T> = { version: 1; scope: AgentOfflineScope; createdAt: number; expiresAt: number; payload: T };

function validId(v: unknown): v is number {
  return Number.isSafeInteger(v) && (v as number) > 0;
}
function validScope(scope: AgentOfflineScope) {
  return validId(scope.userId) && validId(scope.organizationId) && validId(scope.teamId);
}
function validAssignment(value: unknown): value is AgentOfflineAssignment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return validId(v.id) && typeof v.code === "string" && /^[a-zA-Z0-9_-]{1,60}$/.test(v.code) &&
    typeof v.category === "string" && v.category.length > 0 && v.category.length <= 80 &&
    typeof v.status === "string" && VALID_STATUSES.has(v.status);
}
export function agentOfflineKey(scope: AgentOfflineScope, type: "list" | "note", incidentId?: number): string {
  if (!validScope(scope) || (type === "note" && !validId(incidentId))) {
    throw new Error("Escopo offline inválido.");
  }
  return PREFIX + scope.userId + "." + scope.organizationId + "." + scope.teamId +
    "." + type + (type === "note" ? "." + incidentId : "");
}
function write<T>(storage: StoragePort, key: string, scope: AgentOfflineScope, payload: T, now: number) {
  if (!Number.isFinite(now) || now < 0) throw new Error("Relógio inválido.");
  const value: Envelope<T> = { version: 1, scope, createdAt: now, expiresAt: now + AGENT_OFFLINE_TTL_MS, payload };
  storage.setItem(key, JSON.stringify(value));
}
function read<T>(storage: StoragePort, key: string, scope: AgentOfflineScope, validator: (value: unknown) => value is T, now: number): T | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
    if (!raw) return null;
    if (raw.length > 20_000) throw new Error("Cache excessivo.");
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cache inválido.");
    const e = value as Partial<Envelope<unknown>>;
    if (e.version !== 1 || !e.scope || !validScope(e.scope) ||
      e.scope.userId !== scope.userId || e.scope.organizationId !== scope.organizationId || e.scope.teamId !== scope.teamId ||
      typeof e.createdAt !== "number" || typeof e.expiresAt !== "number" ||
      !Number.isFinite(now) || e.createdAt > now || e.expiresAt !== e.createdAt + AGENT_OFFLINE_TTL_MS ||
      now >= e.expiresAt || !validator(e.payload)) throw new Error("Cache expirado ou não autorizado.");
    return e.payload;
  } catch {
    try { storage.removeItem(key); } catch { /* storage unavailable */ }
    return null;
  }
}
function validList(value: unknown): value is AgentOfflineAssignment[] {
  return Array.isArray(value) && value.length <= MAX_SNAPSHOT && value.every(validAssignment);
}
/** F041: capture only explicitly authorized, redacted rows after a successful server query. */
export function saveLastAuthorizedAssignments(storage: StoragePort, scope: AgentOfflineScope, rows: AgentOfflineAssignment[], now = Date.now()) {
  const safe = rows.slice(0, MAX_SNAPSHOT).map(item => ({
    id: item.id, code: item.code, category: item.category, status: item.status,
  }));
  if (!validList(safe)) throw new Error("Lista offline inválida.");
  write(storage, agentOfflineKey(scope, "list"), scope, safe, now);
}
export function loadLastAuthorizedAssignments(storage: StoragePort, scope: AgentOfflineScope, now = Date.now()): AgentOfflineAssignment[] {
  return read(storage, agentOfflineKey(scope, "list"), scope, validList, now) ?? [];
}
/** F042: manual in-tab note draft, never a server event or a queued mutation. */
export function saveAgentNoteDraft(storage: StoragePort, scope: AgentOfflineScope, incidentId: number, note: string, now = Date.now()) {
  if (typeof note !== "string" || note.trim().length < 3 || note.length > 1000)
    throw new Error("Rascunho deve ter entre 3 e 1000 caracteres.");
  write(storage, agentOfflineKey(scope, "note", incidentId), scope, note, now);
}
function validNote(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 3 && value.length <= 1000;
}
export function loadAgentNoteDraft(storage: StoragePort, scope: AgentOfflineScope, incidentId: number, now = Date.now()) {
  return read(storage, agentOfflineKey(scope, "note", incidentId), scope, validNote, now);
}
export function deleteAgentNoteDraft(storage: StoragePort, scope: AgentOfflineScope, incidentId: number) {
  storage.removeItem(agentOfflineKey(scope, "note", incidentId));
}
