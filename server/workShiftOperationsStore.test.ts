import { describe, expect, it } from "vitest";
import { createWorkShiftOperationsStore, type WorkShiftOperationsPersistence } from "./workShiftOperationsStore";

function persistence(overrides: Partial<WorkShiftOperationsPersistence> = {}): WorkShiftOperationsPersistence {
  const pendings: any[] = [];
  return {
    findPendingByDedupeKey: async key => pendings.find(item => item.dedupeKey === key) ?? null,
    insertPending: async input => { const item = { id: pendings.length + 1, status: "open", version: 1, ...input }; pendings.push(item); return item; },
    listSlaPolicies: async () => [],
    listRetentionPolicies: async () => [],
    listPendings: async () => pendings,
    ...overrides,
  };
}

const anomaly = { tenantId: 7, userId: 42, teamId: 3, anomalyType: "missing_start" as const, severity: "warning" as const, referenceId: "assignment:12", windowKey: "2026-09-05T20:00:00.000Z", dedupeKey: "7:42:missing_start:assignment:12:2026-09-05T20:00:00.000Z", detectedAt: new Date("2026-09-05T20:30:00.000Z"), expected: {}, observed: {} };

describe("D-007D operations store", () => {
  it("não duplica pendência para a mesma dedupe key", async () => {
    const store = createWorkShiftOperationsStore(persistence());
    const first = await store.upsertPendingFromAnomaly(anomaly);
    const second = await store.upsertPendingFromAnomaly(anomaly);
    expect(second.id).toBe(first.id);
  });

  it("prioriza SLA específico do tenant, tipo e severidade", async () => {
    const store = createWorkShiftOperationsStore(persistence({ listSlaPolicies: async () => [
      { id: 1, tenantId: 7, anomalyType: null, severity: null, warningAfterMinutes: 30, criticalAfterMinutes: 60, escalationAfterMinutes: 90, active: true },
      { id: 2, tenantId: 7, anomalyType: "missing_start", severity: "warning", warningAfterMinutes: 5, criticalAfterMinutes: 15, escalationAfterMinutes: 30, active: true },
    ] }));
    expect((await store.getEffectiveSlaPolicy(7, "missing_start", "warning")).id).toBe(2);
  });

  it("usa fallback seguro quando não há SLA configurado", async () => {
    const store = createWorkShiftOperationsStore(persistence());
    const policy = await store.getEffectiveSlaPolicy(7, "missing_start", "warning");
    expect(policy.source).toBe("default");
    expect(policy.criticalAfterMinutes).toBeGreaterThan(0);
  });

  it("protege auditoria quando não há política de retenção explícita", async () => {
    const store = createWorkShiftOperationsStore(persistence());
    const policy = await store.getEffectiveRetentionPolicy(7);
    expect(policy.auditProtected).toBe(true);
    expect(policy.historyRetentionDays).toBeNull();
  });
});
