import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIntegrationCircuitCoordinator,
  type IntegrationCircuitCoordinatorStorage,
} from "./integrationCircuitCoordinator";
import type { IntegrationCircuitPersistenceSnapshot } from "./integrationCircuitMySqlStorage";
import type { ProbeManualExecutionApproval, ProbeManualExecutionPlan } from "./integrationProbeManualExecutionPlan";
import type { ProbeOneShotIntentIssueAuthorization } from "./integrationProbeManualExecutionAuthorization";
import { issueAuthorizedIntegrationProbeOneShotIntent } from "./integrationProbeAuthorizedIntentIssue";
import { prepareAuthorizedIntegrationProbeExecutionHandoff } from "./integrationProbeAuthorizedIntentConsumption";
import { createIntegrationProbeExecutor } from "./integrationProbeExecutor";

function store(initial: IntegrationCircuitPersistenceSnapshot) {
  let state = { ...initial };
  const storage: IntegrationCircuitCoordinatorStorage = {
    async load(input) {
      if (state.organizationId !== input.organizationId || state.system !== input.system) return null;
      return { ...state };
    },
    async commitAudited(input) {
      if (state.version !== input.expectedVersion) return false;
      state = { ...input.next };
      return true;
    },
  };
  return { storage, snapshot: () => ({ ...state }) };
}

const approval: ProbeManualExecutionApproval = {
  organizationId: 7,
  system: "neo",
  expectedCircuitVersion: 9,
  requestedAction: "probe_once",
  approvalId: "APR-20261024-001",
  requestedByUserId: 41,
  approvedByUserId: 52,
  approvedAtMs: 1_000,
  expiresAtMs: 601_000,
};

const manualPlan: ProbeManualExecutionPlan = Object.freeze({
  organizationId: 7,
  system: "neo",
  expectedCircuitVersion: 9,
  approvalId: approval.approvalId,
  requestedAction: "probe_once",
  status: "ready_for_manual_operator_review",
  steps: Object.freeze([
    "verify_scope_and_approval",
    "verify_fresh_reconciliation",
    "verify_circuit_version",
    "prepare_one_shot_intent",
    "require_separate_execution_authorization",
  ]),
  permitsProbe: false,
  permitsReplay: false,
  permitsExternalCall: false,
  permitsAutomaticReplay: false,
});

const executionAuthorization: ProbeOneShotIntentIssueAuthorization = Object.freeze({
  organizationId: 7,
  system: "neo",
  expectedCircuitVersion: 9,
  approvalId: approval.approvalId,
  authorizationId: "EXE-AUTH-20261024-001",
  action: "issue_one_shot_probe_intent",
  authorizedByUserId: 63,
  authorizedAtMs: 130_000,
  expiresAtMs: 310_000,
});

const original = {
  runtime: process.env.AXE_RUNTIME_ENV,
  enabled: process.env.AXE_INTEGRATION_PROBE_J32_ENABLED,
};

afterEach(() => {
  if (original.runtime === undefined) delete process.env.AXE_RUNTIME_ENV;
  else process.env.AXE_RUNTIME_ENV = original.runtime;
  if (original.enabled === undefined) delete process.env.AXE_INTEGRATION_PROBE_J32_ENABLED;
  else process.env.AXE_INTEGRATION_PROBE_J32_ENABLED = original.enabled;
});

function enableJ32() {
  process.env.AXE_RUNTIME_ENV = "homologation";
  process.env.AXE_INTEGRATION_PROBE_J32_ENABLED = "true";
}

function issued() {
  return issueAuthorizedIntegrationProbeOneShotIntent({
    approval,
    manualPlan,
    executionAuthorization,
    current: Object.freeze({
      organizationId: 7,
      system: "neo" as const,
      circuitState: "half_open" as const,
      circuitVersion: 9,
      leaseOwner: "probe-worker-j41",
      leaseToken: "LEASE-20261024-J41",
      leaseExpiresAtMs: 300_000,
      executionToken: null,
      executionExpiresAtMs: null,
      executionConsumedAtMs: null,
    }),
    nowEpochMs: 140_000,
    executionToken: "EXEC-20261024-J41",
    executionDurationMs: 60_000,
  });
}

function persistedFromIssued(current: ReturnType<typeof issued>): IntegrationCircuitPersistenceSnapshot {
  return {
    organizationId: current.organizationId,
    system: current.system,
    state: current.circuitState,
    version: current.circuitVersion,
    consecutiveFailures: 3,
    openedAtMs: 1_000,
    cooldownUntilMs: 31_000,
    leaseOwner: current.leaseOwner,
    leaseToken: current.leaseToken,
    leaseExpiresAtMs: current.leaseExpiresAtMs,
    executionToken: current.executionToken,
    executionExpiresAtMs: current.executionExpiresAtMs,
    executionConsumedAtMs: current.executionConsumedAtMs,
  };
}

describe("D-012J J41 — prova J39 -> J40 -> J32", () => {
  it("handoff J40 entra no J32 e o consumo ocorre uma única vez antes do probe falso", async () => {
    enableJ32();
    const current = issued();
    const handoff = prepareAuthorizedIntegrationProbeExecutionHandoff({
      approval,
      manualPlan,
      executionAuthorization,
      current,
      nowEpochMs: 150_000,
      cooldownSeconds: 30,
    });

    expect(current.executionConsumedAtMs).toBeNull();
    expect(handoff.permitsProbe).toBe(false);

    const state = store(persistedFromIssued(current));
    const circuit = createIntegrationCircuitCoordinator(state.storage, () => 150_000);
    const probe = vi.fn(async (input: { organizationId: number; system: string }) => {
      expect(input).toEqual({ organizationId: 7, system: "neo" });
      expect(input).not.toHaveProperty("leaseToken");
      expect(input).not.toHaveProperty("executionToken");
      return "success" as const;
    });
    const executor = createIntegrationProbeExecutor({ circuit, probe });

    const result = await executor.execute(handoff);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      state: "closed",
      version: 12,
      permitsProbe: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
    expect(state.snapshot()).toMatchObject({
      state: "closed",
      version: 12,
      leaseToken: null,
      executionToken: null,
      executionConsumedAtMs: null,
    });

    await expect(executor.execute(handoff)).rejects.toThrow(/versão|CAS|consum|bloqueado/i);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("handoff não habilita J32 fora do opt-in estrito de homologação", async () => {
    delete process.env.AXE_INTEGRATION_PROBE_J32_ENABLED;
    process.env.AXE_RUNTIME_ENV = "homologation";

    const current = issued();
    const handoff = prepareAuthorizedIntegrationProbeExecutionHandoff({
      approval,
      manualPlan,
      executionAuthorization,
      current,
      nowEpochMs: 150_000,
      cooldownSeconds: 30,
    });
    const state = store(persistedFromIssued(current));
    const circuit = createIntegrationCircuitCoordinator(state.storage, () => 150_000);
    const probe = vi.fn(async () => "success" as const);
    const executor = createIntegrationProbeExecutor({ circuit, probe });

    await expect(executor.execute(handoff)).rejects.toThrow(/desabilitad|homologa/i);
    expect(probe).not.toHaveBeenCalled();
    expect(state.snapshot()).toEqual(persistedFromIssued(current));
  });
});
