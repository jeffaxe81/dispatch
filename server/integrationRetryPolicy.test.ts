import { describe, expect, it } from "vitest";
import {
  evaluateIntegrationCircuitGate,
  planIntegrationRetry,
} from "../shared/integrationRetryPolicy";

const NOW = Date.parse("2026-10-22T21:00:00.000Z");

describe("D-012J J13 — retry por adapter e circuit breaker passivo", () => {
  it("calcula backoff exponencial determinístico, por sistema e tenant", () => {
    const first = planIntegrationRetry({
      tenantId: 7, system: "neo", contractVersion: 1,
      failure: "timeout", consecutiveFailures: 1, nowEpochMs: NOW,
    });
    expect(first).toEqual({
      tenantId: 7, system: "neo", contractVersion: 1,
      action: "retry", nextEligibleAtEpochMs: NOW + 1_000,
      coreDisposition: "continue",
    });
    expect(planIntegrationRetry({
      tenantId: 8, system: "neo", contractVersion: 1,
      failure: "timeout", consecutiveFailures: 2, nowEpochMs: NOW,
    })).toMatchObject({
      tenantId: 8, action: "retry", nextEligibleAtEpochMs: NOW + 2_000,
    });
  });

  it("aplica no rate limit espera mínima de 30 segundos", () => {
    const result = planIntegrationRetry({
      tenantId: 7, system: "crm", contractVersion: 1,
      failure: "rate_limited", consecutiveFailures: 1, nowEpochMs: NOW,
    });
    expect(result.action).toBe("retry");
    expect(result.nextEligibleAtEpochMs).toBe(NOW + 30_000);
  });

  it("abre circuito no limiar configurado, mas preserva núcleo do despacho", () => {
    const result = planIntegrationRetry({
      tenantId: 7, system: "neo", contractVersion: 1,
      failure: "unavailable", consecutiveFailures: 3, nowEpochMs: NOW,
    });
    expect(result).toEqual({
      tenantId: 7, system: "neo", contractVersion: 1,
      action: "open_circuit", nextEligibleAtEpochMs: NOW + 60_000,
      coreDisposition: "continue",
    });
  });

  it("envia erro permanente ou orçamento de tentativas esgotado à quarentena", () => {
    for (const failure of ["permanent", "timeout"] as const) {
      const result = planIntegrationRetry({
        tenantId: 7, system: "inventory", contractVersion: 1,
        failure, consecutiveFailures: failure === "permanent" ? 1 : 5,
        nowEpochMs: NOW,
      });
      expect(result.action).toBe("quarantine");
      expect(result.nextEligibleAtEpochMs).toBeNull();
    }
  });

  it("bloqueia circuito aberto até o cooldown, depois exige probe com fencing", () => {
    const base = {
      tenantId: 7, system: "neo" as const, contractVersion: 1,
      circuit: { state: "open" as const, openedAtEpochMs: NOW },
    };
    expect(evaluateIntegrationCircuitGate({ ...base, nowEpochMs: NOW + 59_999 }).decision)
      .toBe("block");
    expect(evaluateIntegrationCircuitGate({ ...base, nowEpochMs: NOW + 60_000 }).decision)
      .toBe("probe_required");
    expect(evaluateIntegrationCircuitGate({
      tenantId: 7, system: "crm", contractVersion: 1, nowEpochMs: NOW,
      circuit: { state: "half_open", openedAtEpochMs: NOW - 120_000 },
    }).decision).toBe("probe_required");
  });

  it("libera somente circuito fechado coerente; decisão não executa IO", () => {
    expect(evaluateIntegrationCircuitGate({
      tenantId: 7, system: "inventory", contractVersion: 1, nowEpochMs: NOW,
      circuit: { state: "closed", openedAtEpochMs: null },
    })).toEqual({
      tenantId: 7, system: "inventory",
      decision: "allow", coreDisposition: "continue",
    });
  });

  it("falha fechado para tenant, sistema, versão, tempo, contador e estados inválidos", () => {
    const valid = {
      tenantId: 7, system: "neo" as const, contractVersion: 1,
      failure: "timeout" as const, consecutiveFailures: 1, nowEpochMs: NOW,
    };
    expect(() => planIntegrationRetry({ ...valid, tenantId: 0 })).toThrow(/tenant/i);
    expect(() => planIntegrationRetry({ ...valid, system: "billing" as never })).toThrow(/contrato/i);
    expect(() => planIntegrationRetry({ ...valid, contractVersion: 2 })).toThrow(/versão/i);
    expect(() => planIntegrationRetry({ ...valid, failure: "unknown" as never })).toThrow(/falha/i);
    expect(() => planIntegrationRetry({ ...valid, consecutiveFailures: 0 })).toThrow(/tentativas/i);
    expect(() => planIntegrationRetry({ ...valid, nowEpochMs: Number.NaN })).toThrow(/tempo/i);
    expect(() => evaluateIntegrationCircuitGate({
      tenantId: 7, system: "neo", contractVersion: 1, nowEpochMs: NOW,
      circuit: { state: "open", openedAtEpochMs: null },
    })).toThrow(/circuito/i);
    expect(() => evaluateIntegrationCircuitGate({
      tenantId: 7, system: "neo", contractVersion: 1, nowEpochMs: NOW,
      circuit: { state: "closed", openedAtEpochMs: NOW },
    })).toThrow(/circuito/i);
    expect(() => evaluateIntegrationCircuitGate({
      tenantId: 7, system: "neo", contractVersion: 1, nowEpochMs: NOW,
      circuit: { state: "invalid" as never, openedAtEpochMs: NOW },
    })).toThrow(/circuito/i);
  });

  it("não expõe payloads, tokens nem erro bruto nas decisões", () => {
    const decision = planIntegrationRetry({
      tenantId: 22, system: "crm", contractVersion: 1,
      failure: "timeout", consecutiveFailures: 1, nowEpochMs: NOW,
    });
    for (const forbidden of ["payload", "token", "authorization", "error", "message", "stack"]) {
      expect(decision).not.toHaveProperty(forbidden);
    }
  });
});
