import { describe, expect, it } from "vitest";
import { evaluateWorkflowSlaReadiness, type WorkflowSlaReadinessInput } from "./workflowSlaReadiness";

const now = "2026-10-22T17:00:00.000Z";
const metrics = {
  pending: 2, leased: 1, deadLetter: 0, expiredLeases: 0,
  waitingRetries: 0, overdue: 2, maxLagMinutes: 4, generatedAt: now,
};
const base: WorkflowSlaReadinessInput = {
  organizationId: 9,
  metricsOrganizationId: 9,
  mode: "manual_homologation",
  now,
  metrics,
  scheduler: { state: "healthy", checkedAt: now },
  adapter: { state: "healthy", checkedAt: now },
  policy: {
    evidenceMaxAgeMs: 60_000,
    pendingWarning: 5,
    pendingCritical: 20,
    lagWarningMinutes: 15,
    lagCriticalMinutes: 60,
  },
};

describe("D-012J J5 — diagnóstico passivo e fail-closed de SLA", () => {
  it("declara ready apenas com evidência completa, fresca e escopada ao tenant", () => {
    expect(evaluateWorkflowSlaReadiness(base)).toEqual({
      organizationId: 9, status: "ready", evaluatedAt: now,
      components: { scheduler: "healthy", adapter: "healthy" },
      backlog: {
        pending: 2, leased: 1, deadLetter: 0, expiredLeases: 0,
        waitingRetries: 0, overdue: 2, maxLagMinutes: 4,
      },
      reasons: [],
    });
  });

  it("desligado permanece disabled sem consultar dependências ou alegar readiness", () => {
    expect(evaluateWorkflowSlaReadiness({
      organizationId: 9, mode: "disabled", now,
    })).toEqual({
      organizationId: 9, status: "disabled", evaluatedAt: now,
      components: { scheduler: "unknown", adapter: "unknown" },
      backlog: null, reasons: ["feature_disabled"],
    });
  });

  it("degrada com DLQ, lease expirado, backlog e atraso moderado", () => {
    const result = evaluateWorkflowSlaReadiness({
      ...base, metrics: { ...metrics, pending: 5, maxLagMinutes: 15,
        deadLetter: 1, expiredLeases: 1 },
      adapter: { state: "degraded", checkedAt: now },
    });
    expect(result.status).toBe("degraded");
    expect(result.reasons).toEqual([
      "adapter_degraded", "pending_warning", "lag_warning",
      "expired_leases", "dead_letter",
    ]);
  });

  it("declara not_ready para limites críticos mesmo com probes saudáveis", () => {
    const result = evaluateWorkflowSlaReadiness({
      ...base, metrics: { ...metrics, pending: 20, maxLagMinutes: 60 },
    });
    expect(result.status).toBe("not_ready");
    expect(result.reasons).toEqual(["pending_critical", "lag_critical"]);
  });

  it("declara not_ready para evidência antiga, futura, ausente ou falha", () => {
    const result = evaluateWorkflowSlaReadiness({
      ...base, now: "2026-10-22T17:02:00.000Z",
      scheduler: { state: "healthy", checkedAt: now },
      adapter: { state: "unhealthy", checkedAt: now },
    });
    expect(result.status).toBe("not_ready");
    expect(result.components).toEqual({ scheduler: "unknown", adapter: "unknown" });
    expect(result.reasons).toEqual([
      "scheduler_unavailable", "adapter_unavailable", "metrics_stale",
    ]);
    expect(evaluateWorkflowSlaReadiness({
      ...base, scheduler: { state: "unknown", checkedAt: null },
    }).status).toBe("not_ready");
    expect(evaluateWorkflowSlaReadiness({
      ...base, scheduler: { state: "healthy", checkedAt: "2026-10-22T17:01:00.000Z" },
    }).components.scheduler).toBe("unknown");
    expect(evaluateWorkflowSlaReadiness({
      ...base, metrics: { ...metrics, generatedAt: "2026-10-22T17:01:00.000Z" },
    }).reasons).toContain("metrics_stale");
    expect(evaluateWorkflowSlaReadiness({
      ...base, adapter: { state: "unhealthy", checkedAt: now },
    }).reasons).toContain("adapter_unavailable");
  });

  it("falha fechado para métrica de outro tenant, modo desconhecido e dados incompletos", () => {
    expect(() => evaluateWorkflowSlaReadiness({
      ...base, metricsOrganizationId: 10,
    })).toThrow(/tenant/i);
    expect(() => evaluateWorkflowSlaReadiness({
      ...base, mode: "automatic" as any,
    })).toThrow(/modo/i);
    expect(() => evaluateWorkflowSlaReadiness({
      ...base, metrics: undefined,
    })).toThrow(/incompletas/i);
  });

  it("rejeita contadores negativos/decimais e políticas inconsistentes", () => {
    for (const pending of [-1, Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => evaluateWorkflowSlaReadiness({
        ...base, metrics: { ...metrics, pending },
      })).toThrow(/contadores/i);
    }
    expect(() => evaluateWorkflowSlaReadiness({
      ...base, policy: { ...base.policy!, lagWarningMinutes: 60 },
    })).toThrow(/política|limites/i);
  });

  it("recusa relógio fora do padrão UTC, calendário inválido e estados de probe inválidos", () => {
    expect(() => evaluateWorkflowSlaReadiness({
      ...base, now: "2026-02-30T17:00:00.000Z",
    })).toThrow(/now/i);
    expect(() => evaluateWorkflowSlaReadiness({
      ...base, scheduler: { state: "unknown-error" as any, checkedAt: now },
    })).toThrow(/estado/i);
    expect(() => evaluateWorkflowSlaReadiness({
      ...base, adapter: { state: "healthy", checkedAt: "2026-02-30T17:00:00.000Z" },
    })).toThrow(/checkedAt/i);
  });

  it("não propaga payload, contato, token nem mensagens brutas para a saída", () => {
    const malicious = evaluateWorkflowSlaReadiness({
      ...base,
      scheduler: { state: "healthy", checkedAt: now, token: "senha" } as any,
      metrics: { ...metrics, recipient: "pessoa@example.com", lastError: "erro sensível",
        notificationBody: "conteúdo confidencial" } as any,
    });
    expect(JSON.stringify(malicious)).not.toMatch(/senha|example.com|erro sensível|confidencial|recipient|lastError|token/i);
  });
});
