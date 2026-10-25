import { describe, expect, it } from "vitest";
import {
  planIntegrationFailureResolution,
  type IntegrationFailureCertainty,
} from "./integrationFailurePolicy";
import type { IntegrationOutboxSnapshot } from "./integrationOutboxCas";

const NOW = Date.parse("2026-10-23T02:00:00.000Z");
const systems = ["neo", "inventory", "crm"] as const;
const current: IntegrationOutboxSnapshot = {
  deliveryId: 101, organizationId: 7, system: "neo", contractVersion: 1,
  mode: "event", operation: "interaction.updated",
  messageId: "msg-101", idempotencyKey: "key-101", correlationId: "corr-101",
  status: "leased", version: 1, attempts: 1, maxAttempts: 5,
  failureThreshold: 3, cooldownSeconds: 30,
  leaseOwner: "worker-101", leaseToken: "secret-lease-101",
  leaseExpiresAtMs: NOW + 10_000,
  nextAttemptAtMs: null, deliveredAtMs: null, deadLetteredAtMs: null,
  payloadReference: "vault:private-101", lastFailureKind: null,
};
type Input = Parameters<typeof planIntegrationFailureResolution>[0];
function input(overrides: Partial<Input> = {}): Input {
  return {
    organizationId: 7,
    current,
    expectedVersion: 1,
    nowEpochMs: NOW,
    failureKind: "rate_limited",
    remoteAcceptance: "confirmed_not_accepted",
    circuit: { state: "closed", openedAtEpochMs: null },
    consecutiveFailures: 1,
    baseDelayMs: 1_000,
    ...overrides,
  };
}
function plan(overrides: Partial<Input> = {}) {
  return planIntegrationFailureResolution(input(overrides));
}

describe("D-012J J25 — contrato de falhas, retry e cooldown fail-closed", () => {
  it("agendamento de rate limit definitivamente rejeitado mantém piso de 30 s e nunca reenvia", () => {
    const p = plan();
    expect(p).toMatchObject({
      organizationId: 7, deliveryId: 101, system: "neo", expectedVersion: 1,
      kind: "rate_limited", disposition: "schedule_retry",
      reason: "confirmed_rejection",
      transition: { outcome: "retry", failureKind: "rate_limited",
        nextAttemptAtMs: NOW + 30_000 },
      permitsExternalCall: false, permitsProbe: false,
      permitsAutomaticReplay: false, requiresTenantScopedCas: true,
      requiresSeparateCircuitLease: true, coreDisposition: "continue",
    });
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.transition)).toBe(true);
  });

  it("timeout ou indisponibilidade com resultado incerto entra em quarentena, nunca retry", () => {
    for (const failureKind of ["timeout", "unavailable", "rate_limited"] as const) {
      const p = plan({
        failureKind, remoteAcceptance: "outcome_unknown",
      });
      expect(p).toMatchObject({
        kind: "unknown", reason: "outcome_uncertain", disposition: "quarantine",
        transition: { outcome: "dead_letter", failureKind: "unknown" },
        permitsExternalCall: false, permitsAutomaticReplay: false,
      });
      expect(p.transition).not.toHaveProperty("nextAttemptAtMs");
    }
  });

  it("erros de autorização, contrato e falha desconhecida são terminais mesmo com não-aceitação", () => {
    for (const failureKind of ["authorization", "contract_mismatch", "unknown"] as const) {
      expect(plan({ failureKind })).toMatchObject({
        disposition: "quarantine", reason: "permanent_or_unclassified",
        transition: { outcome: "dead_letter", failureKind },
      });
    }
  });

  it("respeita esgotamento de tentativas da outbox sem agendar novas tentativas", () => {
    const p = plan({ current: { ...current, attempts: 5 } });
    expect(p).toMatchObject({
      disposition: "quarantine", reason: "attempt_budget_exhausted",
    });
  });

  it("bloqueia circuit breaker open ou half_open e proíbe probe mesmo após cooldown", () => {
    for (const state of ["open", "half_open"] as const) {
      const p = plan({
        circuit: { state, openedAtEpochMs: NOW - 60_000 },
      });
      expect(p).toMatchObject({
        disposition: "quarantine", reason: "circuit_not_closed",
        permitsProbe: false, requiresSeparateCircuitLease: true,
      });
    }
  });

  it("bloqueia threshold de falhas mesmo com circuito aparentemente fechado", () => {
    expect(plan({ consecutiveFailures: 3 })).toMatchObject({
      disposition: "quarantine", reason: "failure_threshold_exceeded",
    });
  });

  it("aplica backoff exponencial persistido com teto de 60 s em todos adapters", () => {
    for (const system of systems) {
      const snapshot = { ...current, system, failureThreshold: 20 };
      expect(plan({
        current: snapshot, failureKind: "unavailable",
        consecutiveFailures: 2, baseDelayMs: 2_000,
      }).transition).toMatchObject({ nextAttemptAtMs: NOW + 4_000 });
      expect(plan({
        current: snapshot, failureKind: "timeout",
        consecutiveFailures: 15, baseDelayMs: 20_000,
      }).transition).toMatchObject({ nextAttemptAtMs: NOW + 60_000 });
    }
  });

  it("usa evidência remota tipada, rejeitando string livre no runtime", () => {
    expect(() => plan({
      remoteAcceptance: "probably okay" as IntegrationFailureCertainty,
    })).toThrow(/evidência/i);
    expect(() => plan({ failureKind: "unmapped" as never }))
      .toThrow(/categoria/i);
  });

  it("bloqueia tenant divergente, versão obsoleta e sistemas sem contrato", () => {
    expect(() => plan({ organizationId: 8 })).toThrow(/tenant/i);
    expect(() => plan({ expectedVersion: 2 })).toThrow(/versão/i);
    expect(() => plan({
      current: { ...current, system: "billing" as never },
    })).toThrow(/contrato/i);
  });

  it("proíbe plano após expiração ou entrega terminal", () => {
    expect(() => plan({ nowEpochMs: NOW + 10_000 })).toThrow(/expirado/i);
    expect(() => plan({
      current: { ...current, status: "delivered", leaseOwner: null, leaseToken: null,
        leaseExpiresAtMs: null, deliveredAtMs: NOW - 1 },
    })).toThrow(/leased|lease ativo/i);
  });

  it("falha fechado para relógio/circuito inválido e timestamps futuros", () => {
    expect(() => plan({ nowEpochMs: Number.NaN })).toThrow(/relógio/i);
    expect(() => plan({
      circuit: { state: "closed", openedAtEpochMs: NOW - 10 },
    })).toThrow(/fechado/i);
    expect(() => plan({
      circuit: { state: "open", openedAtEpochMs: NOW + 1 },
    })).toThrow(/futuro/i);
    expect(() => plan({
      circuit: { state: "half_open", openedAtEpochMs: null },
    })).toThrow(/timestamp/i);
  });

  it("rejeita contadores, tentativas e atrasos sem limites seguros", () => {
    expect(() => plan({ consecutiveFailures: 0 })).toThrow(/consecutivas/i);
    expect(() => plan({ consecutiveFailures: Number.MAX_SAFE_INTEGER + 1 }))
      .toThrow(/consecutivas/i);
    expect(() => plan({ baseDelayMs: 0 })).toThrow(/backoff/i);
    expect(() => plan({ baseDelayMs: 100_000 })).toThrow(/backoff/i);
    expect(() => plan({ current: { ...current, attempts: 7 } }))
      .toThrow(/tentativas/i);
  });

  it("não expõe token, payload, segredo ou resposta bruta no resultado", () => {
    for (const p of [
      plan(),
      plan({ failureKind: "timeout", remoteAcceptance: "outcome_unknown" }),
    ]) {
      const serialized = JSON.stringify(p);
      expect(serialized).not.toContain("secret-lease-101");
      expect(serialized).not.toContain("vault:private-101");
      for (const key of ["leaseToken", "payloadReference", "workerId",
        "authorization", "responseBody", "errorMessage", "nowEpochMs"]) {
        expect(p).not.toHaveProperty(key);
        expect(p.transition).not.toHaveProperty(key);
      }
    }
  });
});
