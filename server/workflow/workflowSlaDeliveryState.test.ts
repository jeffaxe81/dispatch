import { describe, expect, it } from "vitest";
import {
  assertWorkflowSlaDeliveryState,
  transitionWorkflowSlaDelivery,
  type WorkflowSlaDeliveryState,
  type WorkflowSlaDeliveryPolicy,
} from "./workflowSlaDeliveryState";

const policy: WorkflowSlaDeliveryPolicy = {
  maxAttempts: 3,
  leaseDurationMs: 60_000,
  baseRetryMs: 5_000,
  maxRetryMs: 20_000,
};
const due = "2026-10-18T10:00:00.000Z";
const initial: WorkflowSlaDeliveryState = {
  intentId: 44, taskId: 71, organizationId: 9,
  eventKind: "overdue", scheduledAt: due, correlationId: "corr-sla-71",
  status: "pending", version: 0, attempts: 0,
  leaseOwner: null, leaseToken: null, leaseExpiresAt: null,
  nextAttemptAt: null, deliveredAt: null, deadLetteredAt: null,
  lastFailureCode: null,
};

function claim(
  state: WorkflowSlaDeliveryState,
  now = due,
  workerId = "worker-a",
  leaseToken = "opaque-claim-a",
) {
  return transitionWorkflowSlaDelivery(state, {
    type: "claim", organizationId: 9, now, workerId, leaseToken,
  }, policy);
}

function delivery(
  state: WorkflowSlaDeliveryState,
  type: "renew" | "delivered" | "failed",
  now: string,
  overrides: Partial<{ organizationId: number; workerId: string; leaseToken: string; expectedVersion: number }> = {},
) {
  const base = {
    organizationId: 9, now, workerId: "worker-a",
    leaseToken: "opaque-claim-a", expectedVersion: state.version,
    ...overrides,
  };
  return transitionWorkflowSlaDelivery(state,
    type === "failed"
      ? { ...base, type: "failed", failureCode: "timeout" }
      : { ...base, type }, policy);
}

describe("D-012I I5A — lease e fencing das intenções SLA (contrato puro)", () => {
  it("não reserva antes do prazo e não altera o snapshot original", () => {
    const snapshot = { ...initial };
    const result = claim(snapshot, "2026-10-18T09:59:59.999Z");
    expect(result).toEqual({ outcome: "not_due", state: snapshot });
    expect(snapshot).toEqual(initial);
  });

  it("reserva um evento vencido e impede concorrente durante a lease ativa", () => {
    const first = claim(initial);
    expect(first).toMatchObject({
      outcome: "claimed", state: {
        status: "leased", attempts: 1, version: 1,
        leaseOwner: "worker-a", leaseToken: "opaque-claim-a",
        leaseExpiresAt: "2026-10-18T10:01:00.000Z",
      },
    });
    const second = claim(first.state, "2026-10-18T10:00:01.000Z", "worker-b", "opaque-claim-b");
    expect(second).toEqual({ outcome: "lease_held", state: first.state });
    expect(initial.status).toBe("pending");
  });

  it("confirma somente com tenant, dono, token e versão vigentes", () => {
    const leased = claim(initial).state;
    expect(() => delivery(leased, "delivered", "2026-10-18T10:00:05.000Z",
      { organizationId: 10 })).toThrow(/organização/);
    expect(() => delivery(leased, "delivered", "2026-10-18T10:00:05.000Z",
      { workerId: "worker-b" })).toThrow(/obsoletos/);
    expect(() => delivery(leased, "delivered", "2026-10-18T10:00:05.000Z",
      { leaseToken: "wrong-token" })).toThrow(/obsoletos/);
    expect(() => delivery(leased, "delivered", "2026-10-18T10:00:05.000Z",
      { expectedVersion: 0 })).toThrow(/obsoletos/);
    const done = delivery(leased, "delivered", "2026-10-18T10:00:05.000Z");
    expect(done).toMatchObject({
      outcome: "delivered", state: {
        status: "delivered", version: 2,
        deliveredAt: "2026-10-18T10:00:05.000Z",
        leaseOwner: null, leaseToken: null, leaseExpiresAt: null,
      },
    });
    expect(claim(done.state).outcome).toBe("terminal");
  });

  it("renovação invalida confirmação com versão antiga (fencing)", () => {
    const leased = claim(initial).state;
    const renewed = delivery(leased, "renew", "2026-10-18T10:00:40.000Z");
    expect(renewed).toMatchObject({
      outcome: "renewed", state: {
        version: 2, leaseExpiresAt: "2026-10-18T10:01:40.000Z",
      },
    });
    expect(() => delivery(renewed.state, "delivered", "2026-10-18T10:00:41.000Z",
      { expectedVersion: 1 })).toThrow(/obsoletos/);
    expect(delivery(renewed.state, "delivered", "2026-10-18T10:00:41.000Z").outcome)
      .toBe("delivered");
  });

  it("reserva expirada é retomada por outro trabalhador; confirmação atrasada falha", () => {
    const leased = claim(initial).state;
    expect(() => delivery(leased, "delivered", "2026-10-18T10:01:00.000Z"))
      .toThrow(/expirada/);
    expect(() => claim(leased, "2026-10-18T10:01:00.000Z"))
      .toThrow(/token diferente/);
    const takeover = claim(leased, "2026-10-18T10:01:00.000Z", "worker-b", "opaque-claim-b");
    expect(takeover).toMatchObject({ outcome: "claimed", state: {
      attempts: 2, version: 2, leaseOwner: "worker-b",
    } });
    expect(() => delivery(takeover.state, "delivered", "2026-10-18T10:01:01.000Z",
      { expectedVersion: 1 })).toThrow(/obsoletos/);
  });

  it("falha transitória aplica backoff exponencial e bloqueia reprocessamento precoce", () => {
    const leased = claim(initial).state;
    const failed = delivery(leased, "failed", "2026-10-18T10:00:01.000Z");
    expect(failed).toMatchObject({ outcome: "retry_scheduled", state: {
      status: "pending", version: 2, attempts: 1,
      lastFailureCode: "timeout",
      nextAttemptAt: "2026-10-18T10:00:06.000Z",
      leaseOwner: null,
    } });
    expect(claim(failed.state, "2026-10-18T10:00:05.999Z").outcome)
      .toBe("retry_wait");
    const again = claim(failed.state, "2026-10-18T10:00:06.000Z",
      "worker-b", "opaque-claim-b");
    expect(again.state.attempts).toBe(2);
    const failedAgain = transitionWorkflowSlaDelivery(again.state, {
      type: "failed", organizationId: 9, now: "2026-10-18T10:00:07.000Z",
      workerId: "worker-b", leaseToken: "opaque-claim-b",
      expectedVersion: again.state.version, failureCode: "unavailable",
    }, policy);
    expect(failedAgain.state.nextAttemptAt).toBe("2026-10-18T10:00:17.000Z");
    const last = claim(failedAgain.state, "2026-10-18T10:00:17.000Z",
      "worker-c", "opaque-claim-c");
    const dead = transitionWorkflowSlaDelivery(last.state, {
      type: "failed", organizationId: 9, now: "2026-10-18T10:00:18.000Z",
      workerId: "worker-c", leaseToken: "opaque-claim-c",
      expectedVersion: last.state.version, failureCode: "timeout",
    }, policy);
    expect(dead).toMatchObject({ outcome: "dead_lettered", state: {
      status: "dead_letter", attempts: 3,
      nextAttemptAt: null, deadLetteredAt: "2026-10-18T10:00:18.000Z",
    } });
    expect(claim(dead.state).outcome).toBe("terminal");
  });

  it("uma falha permanente é enviada diretamente para quarentena", () => {
    const leased = claim(initial).state;
    const dead = transitionWorkflowSlaDelivery(leased, {
      type: "failed", organizationId: 9, now: "2026-10-18T10:00:01.000Z",
      workerId: "worker-a", leaseToken: "opaque-claim-a",
      expectedVersion: 1, failureCode: "permanent_rejection",
    }, policy);
    expect(dead).toMatchObject({ outcome: "dead_lettered", state: {
      status: "dead_letter", lastFailureCode: "permanent_rejection",
    } });
  });

  it("fecha acesso entre tenants mesmo para evento já entregue", () => {
    const delivered = delivery(claim(initial).state, "delivered",
      "2026-10-18T10:00:10.000Z").state;
    expect(() => transitionWorkflowSlaDelivery(delivered, {
      type: "claim", organizationId: 99, now: due, workerId: "worker-a",
      leaseToken: "new-token",
    }, policy)).toThrow(/organização/);
  });

  it("rejeita datas normalizadas, estados inválidos e configurações arriscadas", () => {
    expect(() => assertWorkflowSlaDeliveryState({
      ...initial, scheduledAt: "2026-02-30T10:00:00.000Z",
    })).toThrow(/calendário/);
    expect(() => assertWorkflowSlaDeliveryState({
      ...initial, status: "leased",
    })).toThrow(/incompleta/);
    expect(() => assertWorkflowSlaDeliveryState({
      ...initial, status: "delivered", deliveredAt: null,
    })).toThrow(/inconsistente/);
    expect(() => transitionWorkflowSlaDelivery(initial, {
      type: "claim", organizationId: 9, now: due, workerId: "worker-a", leaseToken: "token",
    }, { ...policy, maxAttempts: 0 })).toThrow(/maxAttempts/);
  });
});
