import { describe, expect, it } from "vitest";
import type { WorkShiftAnomalyCandidate } from "./workShiftAnomalyService";
import type { PendingRecord } from "./workShiftOperationsStore";
import { createWorkShiftOperationsAlerting } from "./workShiftOperationsAlerting";

const anomaly: WorkShiftAnomalyCandidate = {
  tenantId: 7,
  userId: 42,
  teamId: 3,
  anomalyType: "missing_start",
  severity: "warning",
  detectedAt: new Date("2026-09-05T12:00:00.000Z"),
  referenceId: "assignment:99",
  windowKey: "2026-09-05T11:00:00.000Z",
  dedupeKey: "7:42:missing_start:assignment:99:2026-09-05T11:00:00.000Z",
  expected: { plannedStartAt: "2026-09-05T11:00:00.000Z" },
  observed: { session: null },
};

function pending(overrides: Partial<PendingRecord> = {}): PendingRecord {
  return {
    ...anomaly,
    id: 101,
    status: "open",
    version: 1,
    slaDueAt: new Date("2026-09-05T13:00:00.000Z"),
    ...overrides,
  };
}

describe("D-007D operational alerting", () => {
  it("persists the pendency before publishing the mandatory internal alert", async () => {
    const order: string[] = [];
    const service = createWorkShiftOperationsAlerting({
      upsertPendingFromAnomaly: async () => {
        order.push("pending");
        return pending();
      },
      publishInternalAlert: async input => {
        order.push(`internal:${input.pendingId}`);
      },
      publishExternalAlert: async () => undefined,
      listEscalationCandidates: async () => [],
      markEscalationLevel: async () => true,
    });

    const result = await service.processWorkShiftAnomaly(anomaly);

    expect(result.pending.id).toBe(101);
    expect(order).toEqual(["pending", "internal:101"]);
  });

  it("does not roll back the pendency or internal alert when an external adapter fails", async () => {
    const internal: number[] = [];
    const service = createWorkShiftOperationsAlerting({
      upsertPendingFromAnomaly: async () => pending(),
      publishInternalAlert: async input => {
        internal.push(input.pendingId);
      },
      publishExternalAlert: async () => {
        throw new Error("sms unavailable");
      },
      listEscalationCandidates: async () => [],
      markEscalationLevel: async () => true,
    });

    const result = await service.processWorkShiftAnomaly(anomaly);

    expect(result.pending.id).toBe(101);
    expect(result.externalDelivery).toBe("failed");
    expect(internal).toEqual([101]);
  });

  it("publishes each SLA escalation level only once", async () => {
    const escalated: number[] = [];
    let alreadyMarked = false;
    const service = createWorkShiftOperationsAlerting({
      upsertPendingFromAnomaly: async () => pending(),
      publishInternalAlert: async input => {
        if (input.kind === "sla_escalation") escalated.push(input.level ?? 0);
      },
      publishExternalAlert: async () => undefined,
      listEscalationCandidates: async () => [{ pending: pending(), level: 1 }],
      markEscalationLevel: async () => {
        if (alreadyMarked) return false;
        alreadyMarked = true;
        return true;
      },
    });

    await service.evaluatePendingEscalations({ tenantId: 7, now: new Date("2026-09-05T14:00:00.000Z") });
    await service.evaluatePendingEscalations({ tenantId: 7, now: new Date("2026-09-05T14:01:00.000Z") });

    expect(escalated).toEqual([1]);
  });
});
