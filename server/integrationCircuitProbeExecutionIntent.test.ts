import { describe, expect, it } from "vitest";
import {
  buildProbeExecutionIntent,
  consumeProbeExecutionIntent,
  type IntegrationProbeExecutionSnapshot,
} from "./integrationCircuitProbeExecutionIntent";

const halfOpen: IntegrationProbeExecutionSnapshot = {
  organizationId: 7,
  system: "neo",
  circuitState: "half_open",
  circuitVersion: 5,
  leaseOwner: "trusted-runner",
  leaseToken: "lease-j31",
  leaseExpiresAtMs: 50_000,
  executionToken: null,
  executionExpiresAtMs: null,
  executionConsumedAtMs: null,
};

describe("D-012J J31 — intenção persistida one-shot de probe", () => {
  it("emite intenção sem autorizar probe e limitada ao lease ativo", () => {
    const issued = buildProbeExecutionIntent(halfOpen, {
      nowEpochMs: 40_000,
      expectedVersion: 5,
      leaseToken: "lease-j31",
      executionToken: "exec-j31",
      executionDurationMs: 5_000,
    });
    expect(issued).toMatchObject({
      circuitVersion: 6,
      executionToken: "exec-j31",
      executionExpiresAtMs: 45_000,
      executionConsumedAtMs: null,
      permitsProbe: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
  });

  it("consome exatamente uma vez e só então concede um probe one-shot", () => {
    const issued = buildProbeExecutionIntent(halfOpen, {
      nowEpochMs: 40_000,
      expectedVersion: 5,
      leaseToken: "lease-j31",
      executionToken: "exec-j31",
      executionDurationMs: 5_000,
    });
    const consumed = consumeProbeExecutionIntent(issued, {
      nowEpochMs: 41_000,
      expectedVersion: 6,
      leaseToken: "lease-j31",
      executionToken: "exec-j31",
    });
    expect(consumed).toMatchObject({
      circuitVersion: 7,
      executionConsumedAtMs: 41_000,
      permitsProbe: true,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
    expect(() => consumeProbeExecutionIntent(consumed, {
      nowEpochMs: 41_500,
      expectedVersion: 7,
      leaseToken: "lease-j31",
      executionToken: "exec-j31",
    })).toThrow(/consumid|one-shot/i);
  });

  it("falha fechado para token, versão, estado ou expiração divergentes", () => {
    expect(() => buildProbeExecutionIntent(halfOpen, {
      nowEpochMs: 40_000,
      expectedVersion: 4,
      leaseToken: "lease-j31",
      executionToken: "exec-j31",
      executionDurationMs: 5_000,
    })).toThrow(/versão|CAS/i);

    expect(() => buildProbeExecutionIntent(halfOpen, {
      nowEpochMs: 40_000,
      expectedVersion: 5,
      leaseToken: "wrong",
      executionToken: "exec-j31",
      executionDurationMs: 5_000,
    })).toThrow(/fencing|token/i);

    expect(() => buildProbeExecutionIntent({ ...halfOpen, circuitState: "open" }, {
      nowEpochMs: 40_000,
      expectedVersion: 5,
      leaseToken: "lease-j31",
      executionToken: "exec-j31",
      executionDurationMs: 5_000,
    })).toThrow(/half-open/i);

    expect(() => buildProbeExecutionIntent(halfOpen, {
      nowEpochMs: 49_000,
      expectedVersion: 5,
      leaseToken: "lease-j31",
      executionToken: "exec-j31",
      executionDurationMs: 2_000,
    })).toThrow(/lease|expira/i);
  });
});
