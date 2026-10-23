import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIntegrationProbeAuditReconciler,
  type CircuitProbeAuditState,
  type CircuitProbeAuditEntry,
} from "./integrationProbeAuditReconciler";

const input = { organizationId: 7, system: "neo" as const, expectedConsumedVersion: 8 };
const state: CircuitProbeAuditState = {
  id: 71,
  organizationId: 7,
  system: "neo",
  state: "closed",
  version: 9,
  consecutiveFailures: 0,
  executionConsumedAtMs: null,
};
const consumed: CircuitProbeAuditEntry = {
  resourceId: 71,
  action: "integration.circuit.probe_intent.consumed",
  beforeData: { organizationId: 7, system: "neo", state: "half_open", version: 7, consecutiveFailures: 3 },
  afterData: { organizationId: 7, system: "neo", state: "half_open", version: 8, consecutiveFailures: 3 },
};
const succeeded: CircuitProbeAuditEntry = {
  resourceId: 71,
  action: "integration.circuit.probe.succeeded",
  beforeData: { organizationId: 7, system: "neo", state: "half_open", version: 8, consecutiveFailures: 3 },
  afterData: { organizationId: 7, system: "neo", state: "closed", version: 9, consecutiveFailures: 0 },
};

const oldEnv = {
  runtime: process.env.AXE_RUNTIME_ENV,
  enabled: process.env.AXE_INTEGRATION_PROBE_J33_ENABLED,
};
afterEach(() => {
  if (oldEnv.runtime === undefined) delete process.env.AXE_RUNTIME_ENV;
  else process.env.AXE_RUNTIME_ENV = oldEnv.runtime;
  if (oldEnv.enabled === undefined) delete process.env.AXE_INTEGRATION_PROBE_J33_ENABLED;
  else process.env.AXE_INTEGRATION_PROBE_J33_ENABLED = oldEnv.enabled;
});

describe("D-012J J34 — snapshot consistente de reconciliação", () => {
  it("classifica usando uma única leitura consistente de estado + auditorias", async () => {
    process.env.AXE_RUNTIME_ENV = "homologation";
    process.env.AXE_INTEGRATION_PROBE_J33_ENABLED = "true";

    const readConsistentSnapshot = vi.fn(async () => ({
      state,
      entries: [succeeded, consumed],
    }));
    const reconciler = createIntegrationProbeAuditReconciler({ readConsistentSnapshot });

    await expect(reconciler.reconcile(input)).resolves.toMatchObject({
      status: "circuit_closed_verified",
      permitsReplay: false,
      permitsProbe: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
    expect(readConsistentSnapshot).toHaveBeenCalledTimes(1);
    expect(readConsistentSnapshot).toHaveBeenCalledWith({
      organizationId: 7,
      system: "neo",
    });
  });

  it("não tenta segunda leitura quando o snapshot consistente não encontra circuito", async () => {
    process.env.AXE_RUNTIME_ENV = "homologation";
    process.env.AXE_INTEGRATION_PROBE_J33_ENABLED = "true";

    const readConsistentSnapshot = vi.fn(async () => ({ state: null, entries: [] }));
    const reconciler = createIntegrationProbeAuditReconciler({ readConsistentSnapshot });

    await expect(reconciler.reconcile(input)).resolves.toMatchObject({
      status: "not_found",
      permitsReplay: false,
      permitsExternalCall: false,
    });
    expect(readConsistentSnapshot).toHaveBeenCalledTimes(1);
  });

  it("falha fechado e sanitiza erro da leitura consistente", async () => {
    process.env.AXE_RUNTIME_ENV = "homologation";
    process.env.AXE_INTEGRATION_PROBE_J33_ENABLED = "true";

    const reconciler = createIntegrationProbeAuditReconciler({
      readConsistentSnapshot: vi.fn(async () => {
        throw new Error("mysql://user:secret@private-host/token");
      }),
    });
    const error = await reconciler.reconcile(input).catch((value: unknown) => value);
    expect(String(error)).toMatch(/indisponível|inconsistente/i);
    expect(String(error)).not.toMatch(/secret|private-host|token/i);
  });
});
