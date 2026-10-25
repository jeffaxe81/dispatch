import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIntegrationProbeAuditConsistentReconciler,
  createIntegrationProbeAuditConsistentSnapshotReader,
} from "./integrationProbeAuditConsistentSnapshot";

const input = { organizationId: 7, system: "neo" as const, expectedConsumedVersion: 8 };
const state = {
  id: 71, organizationId: 7, system: "neo" as const, state: "closed" as const,
  version: 9, consecutiveFailures: 0, executionConsumedAtMs: null,
};
const consumedAudit = {
  resourceId: 71,
  action: "integration.circuit.probe_intent.consumed",
  beforeData: { organizationId: 7, system: "neo", state: "half_open", version: 7, consecutiveFailures: 3 },
  afterData: { organizationId: 7, system: "neo", state: "half_open", version: 8, consecutiveFailures: 3 },
};
const successAudit = {
  resourceId: 71,
  action: "integration.circuit.probe.succeeded",
  beforeData: { organizationId: 7, system: "neo", state: "half_open", version: 8, consecutiveFailures: 3 },
  afterData: { organizationId: 7, system: "neo", state: "closed", version: 9, consecutiveFailures: 0 },
};

const initialEnv = {
  runtime: process.env.AXE_RUNTIME_ENV,
  enabled: process.env.AXE_INTEGRATION_PROBE_J34_ENABLED,
};
afterEach(() => {
  if (initialEnv.runtime === undefined) delete process.env.AXE_RUNTIME_ENV;
  else process.env.AXE_RUNTIME_ENV = initialEnv.runtime;
  if (initialEnv.enabled === undefined) delete process.env.AXE_INTEGRATION_PROBE_J34_ENABLED;
  else process.env.AXE_INTEGRATION_PROBE_J34_ENABLED = initialEnv.enabled;
});
function enable() {
  process.env.AXE_RUNTIME_ENV = "homologation";
  process.env.AXE_INTEGRATION_PROBE_J34_ENABLED = "true";
}

describe("D-012J J34 — snapshot consistente da reconciliação de probe", () => {
  it("classifica somente um snapshot único e mantém todas as permissões externas negadas", async () => {
    enable();
    const readSnapshot = vi.fn(async () => ({ state, entries: [successAudit, consumedAudit] }));
    const result = await createIntegrationProbeAuditConsistentReconciler({ readSnapshot }).reconcile(input);
    expect(readSnapshot).toHaveBeenCalledWith({ organizationId: 7, system: "neo" });
    expect(result).toMatchObject({
      status: "circuit_closed_verified",
      permitsProbe: false,
      permitsReplay: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
  });

  it("gate desabilitado impede qualquer leitura consistente", async () => {
    process.env.AXE_RUNTIME_ENV = "homologation";
    delete process.env.AXE_INTEGRATION_PROBE_J34_ENABLED;
    const readSnapshot = vi.fn(async () => ({ state, entries: [] }));
    await expect(createIntegrationProbeAuditConsistentReconciler({ readSnapshot }).reconcile(input))
      .rejects.toThrow(/desabilitad|homologa/i);
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("falha fechado e sanitiza erro do snapshot", async () => {
    enable();
    const readSnapshot = vi.fn(async () => { throw new Error("mysql://user:secret@db/internal"); });
    const error = await createIntegrationProbeAuditConsistentReconciler({ readSnapshot })
      .reconcile(input).catch((value: unknown) => value);
    expect(String(error)).toMatch(/indisponível|inconsistente/i);
    expect(String(error)).not.toContain("secret");
  });

  it("reader exige transação e executa estado+auditoria no mesmo tx", async () => {
    const stateLimit = vi.fn(async () => [state]);
    const stateWhere = vi.fn(() => ({ limit: stateLimit }));
    const auditLimit = vi.fn(async () => [successAudit, consumedAudit]);
    const auditOrder = vi.fn(() => ({ limit: auditLimit }));
    const auditWhere = vi.fn(() => ({ orderBy: auditOrder }));
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: stateWhere })) })
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: auditWhere })) }),
    };
    const transaction = vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));
    const reader = createIntegrationProbeAuditConsistentSnapshotReader({ transaction } as any);
    const snapshot = await reader.readSnapshot({ organizationId: 7, system: "neo" });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
      withConsistentSnapshot: true,
    });
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(snapshot.state).toEqual(state);
    expect(snapshot.entries).toHaveLength(2);
  });

  it("não consulta auditoria quando o circuito não existe no tenant+sistema", async () => {
    const stateLimit = vi.fn(async () => []);
    const stateWhere = vi.fn(() => ({ limit: stateLimit }));
    const tx = {
      select: vi.fn().mockReturnValueOnce({ from: vi.fn(() => ({ where: stateWhere })) }),
    };
    const transaction = vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));
    const snapshot = await createIntegrationProbeAuditConsistentSnapshotReader({ transaction } as any)
      .readSnapshot({ organizationId: 7, system: "neo" });
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(snapshot).toEqual({ state: null, entries: [] });
  });

  it("recusa banco sem suporte transacional antes de qualquer leitura", () => {
    expect(() => createIntegrationProbeAuditConsistentSnapshotReader({ select: vi.fn() } as any))
      .toThrow(/transa/i);
  });

  it("mantém histórico truncado como inconsistente no snapshot transacional", async () => {
    enable();
    const entries = Array.from({ length: 200 }, () => consumedAudit);
    const result = await createIntegrationProbeAuditConsistentReconciler({
      readSnapshot: async () => ({ state, entries }),
    }).reconcile(input);
    expect(result.status).toBe("inconsistent");
  });
});
