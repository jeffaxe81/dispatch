import { describe, expect, it, vi } from "vitest";
import {
  createSlaManualFailover,
  slaManualFailoverAllowed,
} from "./workflowSlaFailover";
import type { SlaFailoverStore } from "./workflowSlaHeartbeatMySql";

const now = "2026-10-22T23:05:00.000Z";
const env = {
  NODE_ENV: "test", AXE_RUNTIME_ENV: "homologation", AXE_SLA_FAILOVER_ENABLED: "true",
};
const transfer = { organizationId: 9, component: "scheduler" as const, operatorApproved: true };

function fixture() {
  const store: SlaFailoverStore = {
    accept: vi.fn(async () => false),
    read: vi.fn(async () => null),
    promote: vi.fn(async () => true),
  };
  const approvedSources = vi.fn(async () => ({
    expectedSourceId: "scheduler-old", nextSourceId: "scheduler-new",
  }));
  const clock = vi.fn(() => now);
  const service = createSlaManualFailover({ store, approvedSources, environment: env, clock });
  return { store, approvedSources, clock, service };
}

describe("D-012J J6F — failover fencing manual", () => {
  it("promove fonte confiável do servidor sem expor IDs ou afirmar saúde", async () => {
    const f = fixture();
    expect(await f.service.transfer(transfer)).toEqual({
      status: "fenced", organizationId: 9, component: "scheduler",
    });
    expect(f.approvedSources).toHaveBeenCalledWith({
      organizationId: 9, component: "scheduler",
    });
    expect(f.store.promote).toHaveBeenCalledWith({
      organizationId: 9, component: "scheduler",
      expectedSourceId: "scheduler-old", nextSourceId: "scheduler-new",
      nowMs: Date.parse(now),
    });
    expect(f.store.accept).not.toHaveBeenCalled();
    expect(f.store.read).not.toHaveBeenCalled();
    expect(JSON.stringify(await f.service.transfer(transfer))).not.toContain("scheduler-new");
  });

  it("bloqueia produção, ambiente incorreto, flag ausente e aprovação ausente antes de I/O", async () => {
    const f = fixture();
    expect(slaManualFailoverAllowed({ ...env, NODE_ENV: "production" })).toBe(false);
    expect(slaManualFailoverAllowed({ ...env, AXE_SLA_FAILOVER_ENABLED: "false" })).toBe(false);
    expect(slaManualFailoverAllowed({ ...env, AXE_RUNTIME_ENV: "production" })).toBe(false);
    for (const environment of [
      { ...env, NODE_ENV: "production" },
      { ...env, AXE_RUNTIME_ENV: "development" },
      { ...env, AXE_SLA_FAILOVER_ENABLED: "" },
    ]) {
      const service = createSlaManualFailover({
        store: f.store, approvedSources: f.approvedSources,
        environment, clock: f.clock,
      });
      await expect(service.transfer(transfer)).rejects.toThrow(/não autorizada/i);
    }
    await expect(f.service.transfer({ ...transfer, operatorApproved: false }))
      .rejects.toThrow(/não autorizada/i);
    await expect(f.service.transfer({ ...transfer, organizationId: 0 }))
      .rejects.toThrow(/não autorizada/i);
    expect(f.approvedSources).not.toHaveBeenCalled();
    expect(f.store.promote).not.toHaveBeenCalled();
    expect(f.clock).not.toHaveBeenCalled();
  });

  it("nega troca de mesma fonte, formato impróprio e política ausente", async () => {
    const f = fixture();
    f.approvedSources.mockResolvedValueOnce({
      expectedSourceId: "same", nextSourceId: "same",
    });
    await expect(f.service.transfer(transfer)).rejects.toThrow(/não autorizada/i);
    f.approvedSources.mockResolvedValueOnce({
      expectedSourceId: "old source", nextSourceId: "next",
    });
    await expect(f.service.transfer(transfer)).rejects.toThrow(/não autorizada/i);
    f.approvedSources.mockRejectedValueOnce(new Error("credential=secret"));
    await expect(f.service.transfer(transfer)).rejects.toThrow("Transferência SLA não autorizada.");
    expect(f.store.promote).not.toHaveBeenCalled();
  });

  it("nega conflito CAS e falha SQL sem expor informações internas", async () => {
    const f = fixture();
    vi.mocked(f.store.promote).mockResolvedValueOnce(false);
    await expect(f.service.transfer(transfer)).rejects.toThrow(/fencing/i);
    vi.mocked(f.store.promote).mockRejectedValueOnce(new Error("SQL password private-host"));
    await expect(f.service.transfer(transfer)).rejects.toThrow("Transferência SLA não autorizada.");
  });

  it("rejeita relógio inválido com fonte ainda não consultada", async () => {
    const f = fixture();
    f.clock.mockReturnValueOnce("2026-02-30T00:00:00.000Z");
    await expect(f.service.transfer(transfer)).rejects.toThrow(/não autorizada/i);
    expect(f.approvedSources).not.toHaveBeenCalled();
  });
});
