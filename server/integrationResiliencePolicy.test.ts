import { describe, expect, it } from "vitest";
import {
  evaluateIntegrationResilience,
  type IntegrationResiliencePolicy,
} from "../shared/integrationResiliencePolicy";

const policy: IntegrationResiliencePolicy = {
  system: "crm",
  maxAttempts: 4,
  failureThreshold: 3,
  cooldownSeconds: 30,
};

describe("D-012J J13 — política de retry e circuit breaker por adapter", () => {
  it("permite primeira tentativa com política explícita do adapter", () => {
    expect(evaluateIntegrationResilience({
      tenantId: 7,
      policy,
      nextAttempt: 1,
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      now: new Date("2026-10-22T22:00:00.000Z"),
    })).toEqual({
      tenantId: 7,
      system: "crm",
      action: "allow",
      allowAttempt: true,
      coreDisposition: "continue",
      retryAfterSeconds: 0,
    });
  });

  it("autoriza retry enquanto houver tentativas e o circuito estiver fechado", () => {
    const result = evaluateIntegrationResilience({
      tenantId: 7,
      policy,
      nextAttempt: 3,
      consecutiveFailures: 2,
      circuitOpenedAt: null,
      now: new Date("2026-10-22T22:00:00.000Z"),
    });

    expect(result.action).toBe("retry");
    expect(result.allowAttempt).toBe(true);
    expect(result.coreDisposition).toBe("continue");
  });

  it("abre o circuito ao atingir o limiar de falhas e não bloqueia o núcleo", () => {
    const result = evaluateIntegrationResilience({
      tenantId: 7,
      policy,
      nextAttempt: 4,
      consecutiveFailures: 3,
      circuitOpenedAt: null,
      now: new Date("2026-10-22T22:00:00.000Z"),
    });

    expect(result).toEqual({
      tenantId: 7,
      system: "crm",
      action: "open_circuit",
      allowAttempt: false,
      coreDisposition: "continue",
      retryAfterSeconds: 30,
    });
  });

  it("mantém circuito aberto durante cooldown e exige fencing no half-open", () => {
    const openedAt = new Date("2026-10-22T22:00:00.000Z");

    const blocked = evaluateIntegrationResilience({
      tenantId: 7,
      policy,
      nextAttempt: 4,
      consecutiveFailures: 3,
      circuitOpenedAt: openedAt,
      now: new Date("2026-10-22T22:00:10.000Z"),
    });
    expect(blocked.action).toBe("open_circuit");
    expect(blocked.allowAttempt).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(20);

    const halfOpen = evaluateIntegrationResilience({
      tenantId: 7,
      policy,
      nextAttempt: 4,
      consecutiveFailures: 3,
      circuitOpenedAt: openedAt,
      now: new Date("2026-10-22T22:00:30.000Z"),
    });
    expect(halfOpen.action).toBe("half_open");
    expect(halfOpen.allowAttempt).toBe(false);
    expect(halfOpen.retryAfterSeconds).toBe(0);
  });

  it("interrompe retries quando o número máximo de tentativas é excedido", () => {
    const result = evaluateIntegrationResilience({
      tenantId: 7,
      policy,
      nextAttempt: 5,
      consecutiveFailures: 2,
      circuitOpenedAt: null,
      now: new Date("2026-10-22T22:00:00.000Z"),
    });

    expect(result.action).toBe("exhausted");
    expect(result.allowAttempt).toBe(false);
    expect(result.coreDisposition).toBe("continue");
  });

  it("falha fechado para tenant, política, relógio ou timestamps inválidos", () => {
    const now = new Date("2026-10-22T22:00:00.000Z");

    expect(() => evaluateIntegrationResilience({
      tenantId: 0,
      policy,
      nextAttempt: 1,
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      now,
    })).toThrow(/tenant/i);

    expect(() => evaluateIntegrationResilience({
      tenantId: 7,
      policy: { ...policy, maxAttempts: 0 },
      nextAttempt: 1,
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      now,
    })).toThrow(/tentativas/i);

    expect(() => evaluateIntegrationResilience({
      tenantId: 7,
      policy: { ...policy, failureThreshold: 0 },
      nextAttempt: 1,
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      now,
    })).toThrow(/falhas|limiar/i);

    expect(() => evaluateIntegrationResilience({
      tenantId: 7,
      policy: { ...policy, cooldownSeconds: 0 },
      nextAttempt: 1,
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      now,
    })).toThrow(/cooldown/i);

    expect(() => evaluateIntegrationResilience({
      tenantId: 7,
      policy,
      nextAttempt: 1,
      consecutiveFailures: 0,
      circuitOpenedAt: new Date("2026-10-22T22:01:00.000Z"),
      now,
    })).toThrow(/futuro|timestamp/i);
  });

  it("não propaga payload, token, autorização ou erro bruto na decisão", () => {
    const result = evaluateIntegrationResilience({
      tenantId: 7,
      policy,
      nextAttempt: 2,
      consecutiveFailures: 1,
      circuitOpenedAt: null,
      now: new Date("2026-10-22T22:00:00.000Z"),
    });

    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("authorization");
    expect(result).not.toHaveProperty("error");
    expect(result).not.toHaveProperty("errorMessage");
  });
});

describe("D-012J J22 — consolidação J13 com fencing obrigatório", () => {
  it("não autoriza probe após cooldown em NEO, Inventário ou CRM sem lease persistido", () => {
    for (const system of ["neo", "inventory", "crm"] as const) {
      const base = {
        tenantId: 7,
        policy: { ...policy, system },
        nextAttempt: 2,
        consecutiveFailures: 3,
        circuitOpenedAt: new Date("2026-10-22T23:00:00.000Z"),
      };
      const before = evaluateIntegrationResilience({
        ...base, now: new Date("2026-10-22T23:00:29.999Z"),
      });
      const boundary = evaluateIntegrationResilience({
        ...base, now: new Date("2026-10-22T23:00:30.000Z"),
      });
      const after = evaluateIntegrationResilience({
        ...base, now: new Date("2026-10-22T23:01:00.000Z"),
      });
      expect(before).toMatchObject({
        action: "open_circuit", allowAttempt: false, coreDisposition: "continue",
      });
      for (const decision of [boundary, after]) {
        expect(decision).toMatchObject({
          tenantId: 7, system, action: "half_open",
          allowAttempt: false, coreDisposition: "continue",
          retryAfterSeconds: 0,
        });
        for (const key of ["leaseToken", "workerId", "credentials", "payload"]) {
          expect(decision).not.toHaveProperty(key);
        }
      }
    }
  });

  it("reiteração da política half-open jamais fabrica aprovação de tentativa", () => {
    const input = {
      tenantId: 9, policy, nextAttempt: 4, consecutiveFailures: 3,
      circuitOpenedAt: new Date("2026-10-22T23:00:00.000Z"),
      now: new Date("2026-10-22T23:00:31.000Z"),
    };
    const decisions = Array.from({ length: 6 }, () =>
      evaluateIntegrationResilience(input));
    expect(decisions).toHaveLength(6);
    expect(decisions.every(d => d.action === "half_open" && d.allowAttempt === false)).toBe(true);
    expect(new Set(decisions.map(d => JSON.stringify(d))).size).toBe(1);
  });
});

describe("D-012J J22 — validação cruzada dos contratos de integração", () => {
  it("rejeita sistema não declarado mesmo sob cast externo de TypeScript", () => {
    expect(() => evaluateIntegrationResilience({
      tenantId: 7,
      policy: { ...policy, system: "unknown-provider" as never },
      nextAttempt: 1,
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      now: new Date("2026-10-22T23:00:00.000Z"),
    })).toThrow(/contrato|sistema|integração/i);
  });

  it("rejeita parâmetros numéricos acima do inteiro seguro", () => {
    for (const patch of [
      { tenantId: Number.MAX_SAFE_INTEGER + 1 },
      { nextAttempt: Number.MAX_SAFE_INTEGER + 1 },
      { consecutiveFailures: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(() => evaluateIntegrationResilience({
        tenantId: 7, policy, nextAttempt: 1,
        consecutiveFailures: 0, circuitOpenedAt: null,
        now: new Date("2026-10-22T23:00:00.000Z"), ...patch,
      })).toThrow(/inteiro/i);
    }
  });
});
