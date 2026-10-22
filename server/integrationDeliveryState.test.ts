import { describe, expect, it } from "vitest";
import {
  transitionIntegrationDelivery,
  type IntegrationDeliveryState,
} from "../shared/integrationDeliveryState";
import {
  createIntegrationDeliveryCoordinator,
  IntegrationDeliveryConflictError,
  type IntegrationDeliveryStorage,
} from "./integrationDeliveryCoordinator";

const now = "2026-10-22T23:30:00.000Z";
const initial: IntegrationDeliveryState = {
  deliveryId: 91,
  organizationId: 7,
  system: "crm",
  contractVersion: 1,
  mode: "event",
  operation: "contact.updated",
  messageId: "msg-91",
  idempotencyKey: "v1:7:crm:contact.updated:msg-91",
  correlationId: "corr-91",
  status: "pending",
  version: 0,
  attempts: 0,
  maxAttempts: 4,
  failureThreshold: 3,
  cooldownSeconds: 30,
  leaseOwner: null,
  leaseToken: null,
  leaseExpiresAt: null,
  nextAttemptAt: null,
  deliveredAt: null,
  deadLetteredAt: null,
  payloadReference: "payload://integration/91",
  lastFailureKind: null,
};

function claim(
  state: IntegrationDeliveryState,
  at = now,
  workerId = "worker-a",
  leaseToken = "lease-a",
) {
  return transitionIntegrationDelivery(state, {
    type: "claim",
    organizationId: 7,
    now: at,
    workerId,
    leaseToken,
    leaseDurationSeconds: 60,
  });
}

describe("D-012J J16 — lifecycle CAS da outbox de integrações", () => {
  it("reserva entrega pendente com fencing e incrementa tentativa/versão", () => {
    const result = claim(initial);
    expect(result).toMatchObject({
      outcome: "claimed",
      state: {
        status: "leased",
        attempts: 1,
        version: 1,
        leaseOwner: "worker-a",
        leaseToken: "lease-a",
        leaseExpiresAt: "2026-10-22T23:31:00.000Z",
      },
    });
    expect(initial.status).toBe("pending");
  });

  it("rejeita confirmação com tenant, worker, token ou versão obsoletos", () => {
    const leased = claim(initial).state;
    const complete = (overrides = {}) => transitionIntegrationDelivery(leased, {
      type: "delivered",
      organizationId: 7,
      now: "2026-10-22T23:30:05.000Z",
      workerId: "worker-a",
      leaseToken: "lease-a",
      expectedVersion: 1,
      ...overrides,
    } as never);

    expect(() => complete({ organizationId: 8 })).toThrow(/organização|tenant/i);
    expect(() => complete({ workerId: "worker-b" })).toThrow(/obsoleto|reserva|lease/i);
    expect(() => complete({ leaseToken: "lease-b" })).toThrow(/obsoleto|reserva|lease/i);
    expect(() => complete({ expectedVersion: 0 })).toThrow(/obsoleto|versão/i);

    expect(complete()).toMatchObject({
      outcome: "delivered",
      state: {
        status: "delivered",
        version: 2,
        deliveredAt: "2026-10-22T23:30:05.000Z",
        leaseOwner: null,
        leaseToken: null,
      },
    });
  });

  it("abre cooldown ao atingir failureThreshold e bloqueia claim precoce", () => {
    const state = {
      ...initial,
      status: "leased" as const,
      version: 5,
      attempts: 3,
      leaseOwner: "worker-a",
      leaseToken: "lease-a",
      leaseExpiresAt: "2026-10-22T23:31:00.000Z",
    };

    const failed = transitionIntegrationDelivery(state, {
      type: "failed",
      organizationId: 7,
      now,
      workerId: "worker-a",
      leaseToken: "lease-a",
      expectedVersion: 5,
      failureKind: "unavailable",
    });

    expect(failed).toMatchObject({
      outcome: "circuit_opened",
      state: {
        status: "pending",
        version: 6,
        nextAttemptAt: "2026-10-22T23:30:30.000Z",
        lastFailureKind: "unavailable",
      },
    });
    expect(claim(failed.state, "2026-10-22T23:30:29.999Z").outcome).toBe("retry_wait");
    expect(claim(failed.state, "2026-10-22T23:30:30.000Z", "worker-b", "lease-b").outcome).toBe("claimed");
  });

  it("manda falha permanente ou tentativas esgotadas para dead-letter", () => {
    const leased = claim(initial).state;
    const permanent = transitionIntegrationDelivery(leased, {
      type: "failed",
      organizationId: 7,
      now: "2026-10-22T23:30:05.000Z",
      workerId: "worker-a",
      leaseToken: "lease-a",
      expectedVersion: 1,
      failureKind: "contract_mismatch",
    });
    expect(permanent).toMatchObject({
      outcome: "dead_lettered",
      state: { status: "dead_letter", lastFailureKind: "contract_mismatch" },
    });

    const exhausted = { ...initial, attempts: 4, version: 8 };
    expect(claim(exhausted)).toMatchObject({
      outcome: "dead_lettered",
      state: { status: "dead_letter", version: 9 },
    });
  });

  it("coordenador usa CAS tenant-scoped e permite no máximo um claim concorrente", async () => {
    let row: IntegrationDeliveryState = { ...initial };
    let writes = 0;
    const storage: IntegrationDeliveryStorage = {
      async loadByTenant({ deliveryId, organizationId }) {
        if (deliveryId !== row.deliveryId || organizationId !== row.organizationId) return null;
        return { ...row };
      },
      async compareAndSwap({ deliveryId, organizationId, expectedVersion, next }) {
        if (deliveryId !== row.deliveryId || organizationId !== row.organizationId || expectedVersion !== row.version) return false;
        row = { ...next };
        writes += 1;
        return true;
      },
    };
    const coordinator = createIntegrationDeliveryCoordinator(storage);

    const results = await Promise.allSettled([
      coordinator.transition({
        deliveryId: 91,
        action: { type: "claim", organizationId: 7, now, workerId: "worker-a", leaseToken: "lease-a", leaseDurationSeconds: 60 },
      }),
      coordinator.transition({
        deliveryId: 91,
        action: { type: "claim", organizationId: 7, now, workerId: "worker-b", leaseToken: "lease-b", leaseDurationSeconds: 60 },
      }),
    ]);

    expect(results.filter(result => result.status === "fulfilled" && result.value.outcome === "claimed")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected" && result.reason instanceof IntegrationDeliveryConflictError)).toHaveLength(1);
    expect(writes).toBe(1);
    expect(row).toMatchObject({ status: "leased", attempts: 1, version: 1 });
  });

  it("falha fechado para escopo ou datas inválidas sem gravar", async () => {
    const storage: IntegrationDeliveryStorage = {
      async loadByTenant() { return { ...initial, organizationId: 8 }; },
      async compareAndSwap() { throw new Error("não deveria gravar"); },
    };
    const coordinator = createIntegrationDeliveryCoordinator(storage);

    await expect(coordinator.transition({
      deliveryId: 91,
      action: { type: "claim", organizationId: 7, now, workerId: "w", leaseToken: "t", leaseDurationSeconds: 60 },
    })).rejects.toThrow(/escopo|organização|tenant/i);

    expect(() => claim(initial, "invalid-date")).toThrow(/utc|data|relógio/i);
  });
});
