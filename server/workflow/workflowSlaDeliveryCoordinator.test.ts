import { describe, expect, it } from "vitest";
import {
  createWorkflowSlaDeliveryCoordinator,
  WorkflowSlaDeliveryConflictError,
  type WorkflowSlaDeliveryStorage,
} from "./workflowSlaDeliveryCoordinator";
import type {
  WorkflowSlaDeliveryPolicy,
  WorkflowSlaDeliveryState,
} from "./workflowSlaDeliveryState";

const now = "2026-10-18T10:00:00.000Z";
const policy: WorkflowSlaDeliveryPolicy = {
  maxAttempts: 3, leaseDurationMs: 60_000, baseRetryMs: 5_000, maxRetryMs: 60_000,
};
const baseline: WorkflowSlaDeliveryState = {
  intentId: 44, taskId: 71, organizationId: 9,
  eventKind: "overdue", scheduledAt: now, correlationId: "corr-44",
  status: "pending", version: 0, attempts: 0,
  leaseOwner: null, leaseToken: null, leaseExpiresAt: null,
  nextAttemptAt: null, deliveredAt: null, deadLetteredAt: null,
  lastFailureCode: null,
};

function storeFixture() {
  let row: WorkflowSlaDeliveryState = { ...baseline };
  let writes = 0;
  const storage: WorkflowSlaDeliveryStorage = {
    async loadByTenant({ intentId, organizationId }) {
      if (intentId !== row.intentId || organizationId !== row.organizationId) return null;
      return { ...row };
    },
    async compareAndSwap({ intentId, organizationId, expectedVersion, next }) {
      // Atomic in the fake: check+assignment without await.
      if (row.intentId !== intentId || row.organizationId !== organizationId
        || row.version !== expectedVersion) return false;
      row = { ...next };
      writes += 1;
      return true;
    },
  };
  return {
    coordinator: createWorkflowSlaDeliveryCoordinator(storage, policy),
    snapshot: () => ({ ...row }), writes: () => writes,
  };
}

const claim = (workerId: string, leaseToken: string, organizationId = 9) => ({
  intentId: 44,
  action: { type: "claim" as const, organizationId, now, workerId, leaseToken },
});

describe("D-012I I5A — coordenador CAS do SLA", () => {
  it("dois workers concorrentes: no máximo um claim pode vencer", async () => {
    const fixture = storeFixture();
    const results = await Promise.allSettled([
      fixture.coordinator.transition(claim("worker-a", "token-a")),
      fixture.coordinator.transition(claim("worker-b", "token-b")),
    ]);
    expect(results.filter(result => result.status === "fulfilled"
      && result.value.outcome === "claimed")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected"
      && result.reason instanceof WorkflowSlaDeliveryConflictError)).toHaveLength(1);
    expect(fixture.snapshot()).toMatchObject({ status: "leased", attempts: 1, version: 1 });
    expect(fixture.writes()).toBe(1);
  });

  it("falha fechada para outro tenant sem consultar ou gravar seu registro", async () => {
    const fixture = storeFixture();
    await expect(fixture.coordinator.transition(claim("worker-x", "token-x", 10)))
      .rejects.toThrow(/escopo autorizado/);
    expect(fixture.snapshot()).toEqual(baseline);
    expect(fixture.writes()).toBe(0);
  });

  it("decisões sem mutação não executam CAS nem confirmam entrega", async () => {
    const fixture = storeFixture();
    const result = await fixture.coordinator.transition({
      intentId: 44,
      action: { type: "claim", organizationId: 9,
        now: "2026-10-18T09:59:59.000Z", workerId: "worker-a", leaseToken: "token-a" },
    });
    expect(result.outcome).toBe("not_due");
    expect(fixture.writes()).toBe(0);
  });

  it("receipts antigos não podem confirmar a entrega após mudança de versão", async () => {
    const fixture = storeFixture();
    await fixture.coordinator.transition(claim("worker-a", "token-a"));
    await expect(fixture.coordinator.transition({
      intentId: 44,
      action: {
        type: "delivered", organizationId: 9, now: "2026-10-18T10:00:05.000Z",
        workerId: "worker-a", leaseToken: "token-a", expectedVersion: 0,
      },
    })).rejects.toThrow(/obsoletos/);
    expect(fixture.writes()).toBe(1);
    const accepted = await fixture.coordinator.transition({
      intentId: 44,
      action: {
        type: "delivered", organizationId: 9, now: "2026-10-18T10:00:05.000Z",
        workerId: "worker-a", leaseToken: "token-a", expectedVersion: 1,
      },
    });
    expect(accepted.outcome).toBe("delivered");
    expect(fixture.snapshot()).toMatchObject({ status: "delivered", version: 2 });
    expect(fixture.writes()).toBe(2);
  });

  it("rejeita armazenamento que retorne objeto de outro tenant", async () => {
    const storage: WorkflowSlaDeliveryStorage = {
      async loadByTenant() { return { ...baseline, organizationId: 10 }; },
      async compareAndSwap() { throw new Error("Não deveria gravar."); },
    };
    const coordinator = createWorkflowSlaDeliveryCoordinator(storage, policy);
    await expect(coordinator.transition(claim("worker-a", "token-a")))
      .rejects.toThrow(/escopo autorizado/);
  });
});
