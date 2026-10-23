import { describe, expect, it } from "vitest";
import { evaluateIntegrationResilience } from "../shared/integrationResiliencePolicy";
import { compareJ13PolicyProfiles } from "../shared/integrationPolicyConformance";
import {
  INTEGRATION_ADAPTER_POLICIES,
  evaluateIntegrationCircuitGate,
  planIntegrationRetry,
} from "./test/fixtures/integrationRetryPolicyJ13Reference";
import type { IntegrationSystem } from "../shared/integrationContracts";

const NOW = Date.parse("2026-10-23T01:00:00.000Z");
const systems: IntegrationSystem[] = ["neo", "inventory", "crm"];

function comparison(system: IntegrationSystem, overrides: {
  maxAttempts?: number;
  failureThreshold?: number;
  cooldownSeconds?: number;
} = {}) {
  const reference = INTEGRATION_ADAPTER_POLICIES[system];
  return compareJ13PolicyProfiles({
    tenantId: 42, contractVersion: 1,
    persisted: {
      system, maxAttempts: reference.maxAttempts,
      failureThreshold: reference.openAfterFailures,
      cooldownSeconds: reference.cooldownMs / 1000,
      ...overrides,
    },
    reference: { system, ...reference },
  });
}

function active(system: IntegrationSystem, input: {
  nextAttempt?: number;
  consecutiveFailures?: number;
  circuitOpenedAt?: Date | null;
  nowEpochMs?: number;
} = {}) {
  const reference = INTEGRATION_ADAPTER_POLICIES[system];
  return evaluateIntegrationResilience({
    tenantId: 42,
    policy: {
      system, maxAttempts: reference.maxAttempts,
      failureThreshold: reference.openAfterFailures,
      cooldownSeconds: reference.cooldownMs / 1000,
    },
    nextAttempt: input.nextAttempt ?? 2,
    consecutiveFailures: input.consecutiveFailures ?? 1,
    circuitOpenedAt: input.circuitOpenedAt ?? null,
    now: new Date(input.nowEpochMs ?? NOW),
  });
}

describe("D-012J J24 — comparação diferencial das duas políticas J13", () => {
  it("compara parâmetros iguais nos três adapters, mas nunca equipara algoritmos", () => {
    for (const system of systems) {
      const verdict = comparison(system);
      expect(verdict).toMatchObject({
        system, parametersAligned: true,
        algorithmsEquivalent: false,
        needsDedicatedCircuitLease: true,
        permitsProbe: false, permitsExternalCall: false,
        coreDisposition: "continue",
      });
      expect(verdict.differences).toEqual([
        "retry_backoff_not_equivalent",
        "permanent_failure_not_equivalent",
        "attempt_counter_not_equivalent",
      ]);
      expect(Object.isFrozen(verdict)).toBe(true);
      expect(Object.isFrozen(verdict.differences)).toBe(true);
    }
  });

  it("identifica diferenças reais de thresholds/cooldown sem sobrepor configuração persistida", () => {
    for (const system of systems) {
      const reference = INTEGRATION_ADAPTER_POLICIES[system];
      const verdict = comparison(system, {
        maxAttempts: reference.maxAttempts + 1,
        failureThreshold: reference.openAfterFailures + 1,
        cooldownSeconds: reference.cooldownMs / 1000 + 1,
      });
      expect(verdict.parametersAligned).toBe(false);
      expect(verdict.differences.slice(0, 3)).toEqual([
        "max_attempts_mismatch", "failure_threshold_mismatch", "cooldown_mismatch",
      ]);
      expect(verdict.permitsExternalCall).toBe(false);
    }
  });

  it("proíbe probe automático no exato término do cooldown em todos os adapters", () => {
    for (const system of systems) {
      const policy = INTEGRATION_ADAPTER_POLICIES[system];
      const opened = new Date(NOW);
      const boundary = NOW + policy.cooldownMs;
      const activeDecision = active(system, {
        nextAttempt: 2, consecutiveFailures: policy.openAfterFailures,
        circuitOpenedAt: opened, nowEpochMs: boundary,
      });
      const altDecision = evaluateIntegrationCircuitGate({
        tenantId: 42, system, contractVersion: 1,
        nowEpochMs: boundary,
        circuit: { state: "open", openedAtEpochMs: NOW },
      });
      expect(activeDecision).toMatchObject({
        action: "half_open", allowAttempt: false, coreDisposition: "continue",
      });
      expect(altDecision).toMatchObject({
        decision: "probe_required", coreDisposition: "continue",
      });
      expect(comparison(system).permitsProbe).toBe(false);
    }
  });

  it("mantém bloqueio antes do cooldown inclusive um milissegundo antes", () => {
    for (const system of systems) {
      const profile = INTEGRATION_ADAPTER_POLICIES[system];
      const before = NOW + profile.cooldownMs - 1;
      const a = active(system, {
        nextAttempt: 2, circuitOpenedAt: new Date(NOW),
        consecutiveFailures: profile.openAfterFailures, nowEpochMs: before,
      });
      const b = evaluateIntegrationCircuitGate({
        tenantId: 42, system, contractVersion: 1, nowEpochMs: before,
        circuit: { state: "open", openedAtEpochMs: NOW },
      });
      expect(a.action).toBe("open_circuit");
      expect(a.allowAttempt).toBe(false);
      expect(b.decision).toBe("block");
    }
  });

  it("reconhece divergência: fechado pode produzir allow mas não autorização de transporte", () => {
    for (const system of systems) {
      expect(active(system, { nextAttempt: 1, consecutiveFailures: 0 })).toMatchObject({
        action: "allow", allowAttempt: true,
      });
      expect(evaluateIntegrationCircuitGate({
        tenantId: 42, system, contractVersion: 1, nowEpochMs: NOW,
        circuit: { state: "closed", openedAtEpochMs: null },
      }).decision).toBe("allow");
      // These are only pure classification decisions, never signed worker grants.
      expect(comparison(system).permitsExternalCall).toBe(false);
    }
  });

  it("não confunde budget de tentativas com consecutiveFailures do algoritmo alternativo", () => {
    for (const system of systems) {
      const profile = INTEGRATION_ADAPTER_POLICIES[system];
      const alt = planIntegrationRetry({
        tenantId: 42, system, contractVersion: 1, failure: "timeout",
        consecutiveFailures: profile.maxAttempts, nowEpochMs: NOW,
      });
      const persisted = active(system, {
        nextAttempt: 2, consecutiveFailures: profile.maxAttempts,
      });
      expect(alt.action).toBe("quarantine");
      expect(persisted.action).toBe("open_circuit");
      expect(persisted.allowAttempt).toBe(false);
      expect(comparison(system).algorithmsEquivalent).toBe(false);
    }
  });

  it("falha permanente é classificada no modelo #146, não é parâmetro de #145", () => {
    for (const system of systems) {
      const other = planIntegrationRetry({
        tenantId: 42, system, contractVersion: 1,
        failure: "permanent", consecutiveFailures: 1, nowEpochMs: NOW,
      });
      const persisted = active(system, { nextAttempt: 2, consecutiveFailures: 1 });
      expect(other).toMatchObject({ action: "quarantine", nextEligibleAtEpochMs: null });
      expect(persisted.action).toBe("retry");
      expect(comparison(system).differences).toContain("permanent_failure_not_equivalent");
    }
  });

  it("rate_limited tem espera mínima de 30s na alternativa, mas não equivale a retryAfterSeconds", () => {
    const other = planIntegrationRetry({
      tenantId: 42, system: "neo", contractVersion: 1,
      failure: "rate_limited", consecutiveFailures: 1, nowEpochMs: NOW,
    });
    expect(other).toMatchObject({
      action: "retry", nextEligibleAtEpochMs: NOW + 30_000,
    });
    expect(active("neo", { nextAttempt: 2, consecutiveFailures: 1 })).toMatchObject({
      action: "retry", retryAfterSeconds: 0,
    });
    expect(comparison("neo").differences).toContain("retry_backoff_not_equivalent");
  });

  it("distingue limites de configuração persistida vs defaults estáticos por adapter", () => {
    const defaultCrm = INTEGRATION_ADAPTER_POLICIES.crm;
    expect(defaultCrm.cooldownMs).toBe(90_000);
    expect(defaultCrm.openAfterFailures).toBe(4);
    const nonDefault = comparison("crm", {
      maxAttempts: 4, failureThreshold: 3, cooldownSeconds: 30,
    });
    expect(nonDefault.parametersAligned).toBe(false);
    expect(nonDefault.permitsExternalCall).toBe(false);
  });

  it("rejeita sistema cruzado, versão errada, tenants e números inseguros", () => {
    const base = INTEGRATION_ADAPTER_POLICIES.neo;
    const valid = {
      tenantId: 42, contractVersion: 1,
      persisted: {
        system: "neo" as const, maxAttempts: base.maxAttempts,
        failureThreshold: base.openAfterFailures,
        cooldownSeconds: base.cooldownMs / 1000,
      },
      reference: { system: "neo" as const, ...base },
    };
    expect(() => compareJ13PolicyProfiles({
      ...valid, reference: { ...valid.reference, system: "crm" },
    })).toThrow(/sistemas diferentes/i);
    expect(() => compareJ13PolicyProfiles({ ...valid, contractVersion: 2 }))
      .toThrow(/versão/i);
    expect(() => compareJ13PolicyProfiles({ ...valid, tenantId: 0 }))
      .toThrow(/tenant/i);
    expect(() => compareJ13PolicyProfiles({
      ...valid,
      persisted: { ...valid.persisted, cooldownSeconds: Number.MAX_SAFE_INTEGER + 1 },
    })).toThrow(/inválido/i);
  });

  it("nunca transporta payload, lease token, segredo nem erro bruto em resultado comparado", () => {
    const verdict = comparison("crm");
    for (const key of [
      "leaseToken", "authorization", "payload", "payloadReference",
      "error", "workerId", "ticket", "idempotencyKey",
    ]) expect(verdict).not.toHaveProperty(key);
    expect(Object.keys(verdict)).toEqual([
      "system", "contractVersion", "parametersAligned", "algorithmsEquivalent",
      "needsDedicatedCircuitLease", "permitsProbe", "permitsExternalCall",
      "coreDisposition", "differences",
    ]);
  });
});
