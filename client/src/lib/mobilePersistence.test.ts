import { describe, expect, it } from "vitest";
import { loadAuthorizedAssignmentSnapshot, saveLastAuthorizedAssignments, agentOfflineKey, AGENT_OFFLINE_TTL_MS } from "./agentOffline";
import { clearDispatchDataOnLogout } from "./dispatchSensitiveStorage";

const scope = { userId: 19, organizationId: 7, teamId: 4 };
function store() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() { return map.size; },
    snapshot: () => JSON.stringify(Array.from(map.entries())),
  };
}

describe("AXE Despacho Mobile — persistence of redacted operational context", () => {
  it("can load the same minimal summary after a simulated browser restart", () => {
    const deviceStorage = store();
    saveLastAuthorizedAssignments(deviceStorage, scope, [
      { id: 35, code: "OCO-35", category: "Resgate", status: "aceita",
        address: "NEVER STORE", latitude: "-27.0", token: "SECRET" },
    ] as unknown as Parameters<typeof saveLastAuthorizedAssignments>[2], 1_000);
    const reopenedApp = deviceStorage;
    expect(loadAuthorizedAssignmentSnapshot(reopenedApp, scope, 1_500)?.rows).toEqual([
      { id: 35, code: "OCO-35", category: "Resgate", status: "aceita" },
    ]);
    expect(deviceStorage.snapshot()).not.toContain("NEVER STORE");
    expect(deviceStorage.snapshot()).not.toContain("SECRET");
    expect(deviceStorage.snapshot()).not.toContain("latitude");
  });

  it("expires automatically and keeps user/tenant/team boundaries", () => {
    const deviceStorage = store();
    saveLastAuthorizedAssignments(deviceStorage, scope, [
      { id: 35, code: "OCO-35", category: "Resgate", status: "aceita" },
    ], 1_000);
    expect(loadAuthorizedAssignmentSnapshot(deviceStorage, { ...scope, teamId: 5 }, 1_100)).toBeNull();
    expect(loadAuthorizedAssignmentSnapshot(deviceStorage, scope, 1_000 + AGENT_OFFLINE_TTL_MS)).toBeNull();
    expect(deviceStorage.getItem(agentOfflineKey(scope, "list"))).toBeNull();
  });

  it("deletes the persisted local copy on logout while preserving unrelated app storage", () => {
    const deviceStorage = store();
    const sessionStorage = store();
    saveLastAuthorizedAssignments(deviceStorage, scope, [
      { id: 35, code: "OCO-35", category: "Resgate", status: "aceita" },
    ], 1_000);
    deviceStorage.setItem("another-app.preferences", "keep");
    sessionStorage.setItem("dispatch.offline.agent.v1.demo", "draft");
    const removed = clearDispatchDataOnLogout(deviceStorage, sessionStorage);
    expect(removed.local).toContain(agentOfflineKey(scope, "list"));
    expect(deviceStorage.getItem(agentOfflineKey(scope, "list"))).toBeNull();
    expect(deviceStorage.getItem("another-app.preferences")).toBe("keep");
    expect(sessionStorage.length).toBe(0);
  });
});
