type LocalKeys = Pick<Storage, "length" | "key" | "removeItem">;

const SENSITIVE_EXACT_KEYS = new Set([
  "axe-dispatch-local-user",
  "dispatch.activeOrganizationId",
]);
const SENSITIVE_PREFIXES = [
  "dispatch.offline.",
  "dispatch.kanban.views.v1.",
] as const;

/**
 * F050: remove only application-owned sensitive keys, never clear() all
 * browser storage (which could delete unrelated apps and session settings).
 * Enumerate first, so removing a key does not shift indices being inspected.
 */
export function clearSensitiveDispatchStorage(storage: LocalKeys): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && (SENSITIVE_EXACT_KEYS.has(key) ||
      SENSITIVE_PREFIXES.some(prefix => key.startsWith(prefix)))) keys.push(key);
  }
  const cleared: string[] = [];
  for (const key of keys) {
    try { storage.removeItem(key); cleared.push(key); } catch { /* retry on next logout */ }
  }
  return cleared;
}

export function clearDispatchDataOnLogout(local: LocalKeys, session: LocalKeys) {
  return {
    local: clearSensitiveDispatchStorage(local),
    session: clearSensitiveDispatchStorage(session),
  };
}
