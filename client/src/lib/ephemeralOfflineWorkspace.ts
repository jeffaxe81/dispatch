export const OFFLINE_SNAPSHOT_TTL_MS = 15 * 60 * 1000;
const MAX_ROWS = 50;
export type OfflineIncident = { id: number; code: string; status: string; priority: string };
export type OfflineDraft = { incidentId: number; expectedStatus: string; note: string };
export type OfflineWorkspace = {
  userId: number; organizationId: number; capturedAt: number; expiresAt: number;
  incidents: OfflineIncident[]; drafts: OfflineDraft[];
};

/**
 * AXED-F041/42/45/46 — EPHEMERAL memory only, never localStorage/IndexedDB.
 * Snapshot uses an allowlist; names, addresses, contacts and descriptions
 * are never copied. A user-confirmed submit is the only sync path.
 */
export function captureAuthorizedOfflineList(
  rows: readonly { incident: { id: number; code: string; status: string; priority: string } }[],
  userId: number, organizationId: number, now: number,
): OfflineWorkspace {
  if (!Number.isSafeInteger(userId) || userId <= 0 ||
      !Number.isSafeInteger(organizationId) || organizationId <= 0 ||
      !Number.isFinite(now) || now <= 0) throw new Error("Sessão ou empresa inválida para consulta offline.");
  return {
    userId, organizationId, capturedAt: now, expiresAt: now + OFFLINE_SNAPSHOT_TTL_MS,
    incidents: rows.slice(0, MAX_ROWS)
      .filter(row => Number.isSafeInteger(row.incident.id) && row.incident.id > 0)
      .map(({ incident }) => ({
        id: incident.id, code: incident.code.slice(0, 32),
        status: incident.status.slice(0, 60), priority: incident.priority.slice(0, 24),
      })),
    drafts: [],
  };
}
export function assertOfflineSnapshotActive(
  state: OfflineWorkspace | null, userId: number, organizationId: number, now: number,
): asserts state is OfflineWorkspace {
  if (!state || !Number.isFinite(now) || state.userId !== userId || state.organizationId !== organizationId ||
    now < state.capturedAt || now >= state.expiresAt || state.expiresAt - state.capturedAt !== OFFLINE_SNAPSHOT_TTL_MS)
    throw new Error("Consulta offline expirada ou fora da sessão/empresa autorizada. Reconecte e atualize.");
}
export function setOfflineDraft(
  state: OfflineWorkspace, userId: number, organizationId: number,
  incidentId: number, note: string, now: number,
): OfflineWorkspace {
  assertOfflineSnapshotActive(state, userId, organizationId, now);
  const incident = state.incidents.find(row => row.id === incidentId);
  if (!incident) throw new Error("Ocorrência ausente da última lista autorizada.");
  if (note.length > 1000) throw new Error("Rascunho deve ter até 1000 caracteres.");
  const updated = state.drafts.filter(draft => draft.incidentId !== incidentId);
  if (note.trim().length) updated.push({ incidentId, expectedStatus: incident.status, note });
  return { ...state, drafts: updated };
}
export function requireExplicitOfflineSync(
  state: OfflineWorkspace, userId: number, organizationId: number,
  incidentId: number, confirmed: boolean, now: number,
): OfflineDraft {
  assertOfflineSnapshotActive(state, userId, organizationId, now);
  if (!confirmed) throw new Error("Sincronização de anotação exige confirmação humana.");
  const draft = state.drafts.find(row => row.incidentId === incidentId);
  if (!draft || draft.note.trim().length < 3 || draft.note.trim().length > 1000)
    throw new Error("Rascunho inválido para sincronizar.");
  if (!state.incidents.some(row => row.id === incidentId && row.status === draft.expectedStatus))
    throw new Error("Estado offline alterado; recarregue antes de sincronizar.");
  return { ...draft, note: draft.note.trim() };
}
