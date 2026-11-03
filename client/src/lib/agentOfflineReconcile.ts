import type { AgentOfflineAssignment } from "./agentOffline";

export type AgentAssignmentDifference = {
  id: number;
  code: string;
  kind: "changed" | "removed" | "added";
  previousStatus?: string;
  currentStatus?: string;
};
export type AgentAssignmentReconciliation = {
  changed: number;
  added: number;
  removed: number;
  unchanged: number;
  differences: AgentAssignmentDifference[];
};

/**
 * F046: read-only difference between a previously authorized redacted snapshot
 * and a newly fetched authorized server list. Never authorizes or replays writes.
 */
export function compareAgentOfflineAssignments(
  previous: readonly AgentOfflineAssignment[],
  current: readonly AgentOfflineAssignment[],
): AgentAssignmentReconciliation {
  const index = (items: readonly AgentOfflineAssignment[]) => {
    if (items.length > 50) throw new Error("Limite do resumo excedido.");
    const mapped = new Map<number, AgentOfflineAssignment>();
    for (const item of items) {
      if (!Number.isSafeInteger(item.id) || item.id <= 0 || !item.code || !item.status || mapped.has(item.id))
        throw new Error("Resumo de atribuições inconsistente.");
      mapped.set(item.id, item);
    }
    return mapped;
  };
  const was = index(previous);
  const now = index(current);
  const result: AgentAssignmentReconciliation = {changed: 0, added: 0, removed: 0, unchanged: 0, differences: []};
  for (const [id, old] of was) {
    const updated = now.get(id);
    if (!updated) {
      result.removed++;
      result.differences.push({id, code: old.code, kind: "removed", previousStatus: old.status});
    } else if (updated.status !== old.status || updated.code !== old.code) {
      result.changed++;
      result.differences.push({id, code: updated.code, kind: "changed", previousStatus: old.status, currentStatus: updated.status});
    } else {
      result.unchanged++;
    }
  }
  for (const [id, added] of now) {
    if (was.has(id)) continue;
    result.added++;
    result.differences.push({id, code: added.code, kind: "added", currentStatus: added.status});
  }
  return result;
}
