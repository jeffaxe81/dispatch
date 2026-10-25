import { describe, expect, it } from "vitest";
import { projectAuthorizedProbeOperationalStatus } from "./integrationProbeAuthorizedExecutionStatus";
import type { AuthorizedProbeExecutionWithReceipt } from "./integrationProbeAuthorizedExecutionReceipt";

function execution(state: string): AuthorizedProbeExecutionWithReceipt {
  return {
    result: {
      organizationId: 7,
      system: "neo",
      state: state as any,
      version: 12,
      consecutiveFailures: 0,
      openedAtMs: null,
      cooldownUntilMs: null,
      permitsProbe: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    },
    receipt: {
      executionId: "EXECUTION-J44-001",
      organizationId: 7,
      system: "neo",
      state,
      version: 12,
      executedAtMs: 141_000,
      durationMs: 1_000,
      outcome: "success",
    },
  };
}

describe("D-012J J44 — projeção operacional do recibo autorizado", () => {
  it("considera saudável somente o estado real closed", () => {
    expect(projectAuthorizedProbeOperationalStatus(execution("closed"))).toMatchObject({
      healthy: true,
      severity: "ok",
    });
    expect(projectAuthorizedProbeOperationalStatus(execution("open"))).toMatchObject({
      healthy: false,
      severity: "attention",
    });
    expect(projectAuthorizedProbeOperationalStatus(execution("half_open"))).toMatchObject({
      healthy: false,
      severity: "attention",
    });
  });

  it("não transforma estados arbitrários em estado saudável", () => {
    expect(projectAuthorizedProbeOperationalStatus(execution("success"))).toMatchObject({
      healthy: false,
      severity: "attention",
    });
    expect(projectAuthorizedProbeOperationalStatus(execution("completed"))).toMatchObject({
      healthy: false,
      severity: "attention",
    });
  });

  it("não projeta tokens nem identificadores de autorização", () => {
    const status = projectAuthorizedProbeOperationalStatus(execution("closed"));
    expect(status).not.toHaveProperty("leaseToken");
    expect(status).not.toHaveProperty("executionToken");
    expect(status).not.toHaveProperty("approvalId");
    expect(status).not.toHaveProperty("authorizationId");
  });
});
