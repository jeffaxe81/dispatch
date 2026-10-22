import { describe, expect, it, vi } from "vitest";
import {
  evaluateSlaDiagnosticPreview,
  slaDiagnosticPreviewMode,
  type SlaDiagnosticPreviewDependencies,
} from "./workflowSlaDiagnosticPreview";

const now = "2026-10-22T22:00:00.000Z";
const metrics = {
  pending: 12, leased: 2, deadLetter: 1, expiredLeases: 0,
  waitingRetries: 1, overdue: 3, maxLagMinutes: 16, generatedAt: now,
};
const healthy = { organizationId: 9, state: "healthy" as const, checkedAt: now };

function dependencies(): SlaDiagnosticPreviewDependencies {
  return {
    metrics: vi.fn(async () => metrics),
  };
}

describe("D-012J J6C — passive SLA diagnostic preview", () => {
  it("desabilita por padrão e em produção, mesmo com flag indevida", () => {
    expect(slaDiagnosticPreviewMode({})).toBe("disabled");
    expect(slaDiagnosticPreviewMode({
      NODE_ENV: "production", AXE_RUNTIME_ENV: "homologation",
      AXE_SLA_READINESS_PREVIEW_ENABLED: "true",
    })).toBe("disabled");
    expect(slaDiagnosticPreviewMode({
      NODE_ENV: "test", AXE_RUNTIME_ENV: "production",
      AXE_SLA_READINESS_PREVIEW_ENABLED: "true",
    })).toBe("disabled");
    expect(slaDiagnosticPreviewMode({
      NODE_ENV: "test", AXE_RUNTIME_ENV: "homologation",
      AXE_SLA_READINESS_PREVIEW_ENABLED: "false",
    })).toBe("disabled");
    expect(slaDiagnosticPreviewMode({
      NODE_ENV: "test", AXE_RUNTIME_ENV: "homologation",
      AXE_SLA_READINESS_PREVIEW_ENABLED: "true",
    })).toBe("manual_homologation");
  });

  it("não consulta banco nem probes quando desabilitado", async () => {
    const d = dependencies();
    d.schedulerProbe = vi.fn(async () => healthy);
    d.adapterProbe = vi.fn(async () => healthy);
    expect(await evaluateSlaDiagnosticPreview({
      organizationId: 9, now, mode: "disabled", dependencies: d,
    })).toMatchObject({
      organizationId: 9, status: "disabled",
      backlog: null, components: { scheduler: "unknown", adapter: "unknown" },
      reasons: ["feature_disabled"],
    });
    expect(d.metrics).not.toHaveBeenCalled();
    expect(d.schedulerProbe).not.toHaveBeenCalled();
    expect(d.adapterProbe).not.toHaveBeenCalled();
  });

  it("exibe métricas reais sem afirmar saúde sem heartbeat de componentes", async () => {
    const d = dependencies();
    const result = await evaluateSlaDiagnosticPreview({
      organizationId: 9, now, mode: "manual_homologation", dependencies: d,
    });
    expect(result).toMatchObject({
      organizationId: 9, status: "not_ready",
      components: { scheduler: "unknown", adapter: "unknown" },
      backlog: { pending: 12, leased: 2, deadLetter: 1, maxLagMinutes: 16 },
    });
    expect(result.reasons).toEqual([
      "scheduler_unavailable", "adapter_unavailable",
      "pending_warning", "lag_warning", "dead_letter",
    ]);
    expect(d.metrics).toHaveBeenCalledWith({ organizationId: 9, now });
  });

  it("descarta prova de outro tenant, falha de probe e evidência vencida", async () => {
    const d = dependencies();
    d.schedulerProbe = vi.fn(async () => ({ ...healthy, organizationId: 10 }));
    d.adapterProbe = vi.fn(async () => { throw new Error("senha segredo private@example.com"); });
    const result = await evaluateSlaDiagnosticPreview({
      organizationId: 9, now, mode: "manual_homologation", dependencies: d,
    });
    expect(result.status).toBe("not_ready");
    expect(result.components).toEqual({ scheduler: "unknown", adapter: "unknown" });
    expect(JSON.stringify(result)).not.toMatch(/senha|segredo|example\.com/i);
    d.schedulerProbe = vi.fn(async () => ({
      ...healthy, checkedAt: "2026-10-22T21:58:00.000Z",
    }));
    expect((await evaluateSlaDiagnosticPreview({
      organizationId: 9, now, mode: "manual_homologation", dependencies: d,
    })).components.scheduler).toBe("unknown");
  });

  it("somente evidência escopada, atual e explícita pode produzir ready", async () => {
    const d = dependencies();
    d.metrics = vi.fn(async () => ({
      ...metrics, pending: 1, leased: 0, deadLetter: 0,
      waitingRetries: 0, overdue: 0, maxLagMinutes: 0,
    }));
    d.schedulerProbe = vi.fn(async () => ({
      ...healthy, secret: "do-not-return",
    } as typeof healthy));
    d.adapterProbe = vi.fn(async () => healthy);
    const result = await evaluateSlaDiagnosticPreview({
      organizationId: 9, now, mode: "manual_homologation", dependencies: d,
    });
    expect(result.status).toBe("ready");
    expect(JSON.stringify(result)).not.toContain("do-not-return");
  });

  it("métricas inválidas e indisponibilidade do banco jamais retornam ready", async () => {
    const d = dependencies();
    d.metrics = vi.fn(async () => { throw new Error("MySQL indisponível"); });
    await expect(evaluateSlaDiagnosticPreview({
      organizationId: 9, now, mode: "manual_homologation", dependencies: d,
    })).rejects.toThrow(/métricas SLA indisponíveis/i);
    d.metrics = vi.fn(async () => ({ ...metrics, pending: -1 }));
    await expect(evaluateSlaDiagnosticPreview({
      organizationId: 9, now, mode: "manual_homologation", dependencies: d,
    })).rejects.toThrow(/contadores/i);
    await expect(evaluateSlaDiagnosticPreview({
      organizationId: 0, now, mode: "manual_homologation", dependencies: d,
    })).rejects.toThrow(/tenant/i);
  });
});
