import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authorizeRecoveryAction } from "./activeRecoveryAuthorization";
import { createActiveRecoveryBootstrap } from "./activeRecoveryBootstrap";

const request = {
  actionId: "action:decision-1",
  transitionId: "transition-1",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-08T00:00:00.000Z",
  correlationId: "decision-1",
};

describe("createActiveRecoveryBootstrap", () => {
  it("is disabled by default and scoped to homologation/database/restart", () => {
    const bootstrap = createActiveRecoveryBootstrap();
    expect(bootstrap.config).toEqual({
      enabled: false,
      environment: "homologation-controlled",
      authorizedEnvironment: "homologation-controlled",
      authorizedComponent: "database",
      authorizedAction: "restart_component",
      leaseNamespace: "d011b3-v1",
    });
  });

  it("keeps the runtime action port simulation-only", async () => {
    const bootstrap = createActiveRecoveryBootstrap();
    const result = await bootstrap.actionPort.execute(request);
    expect(result.status).toBe("simulated_success");
    expect(result.reasonCode).toBe("SIMULATED_SUCCESS");
  });

  it("never authorizes production", () => {
    const bootstrap = createActiveRecoveryBootstrap({
      config: {
        enabled: true,
        environment: "production",
        authorizedEnvironment: "homologation-controlled",
        authorizedComponent: "database",
        authorizedAction: "restart_component",
        leaseNamespace: "d011b3-v1",
      },
    });
    expect(authorizeRecoveryAction({ request, config: bootstrap.config })).toMatchObject({
      authorized: false,
      reasonCode: "ENVIRONMENT_NOT_AUTHORIZED",
    });
  });

  it("does not introduce execution primitives, remote hooks, or an env enable knob", () => {
    const source = readFileSync(new URL("./activeRecoveryBootstrap.ts", import.meta.url), "utf8");
    for (const forbidden of [
      "child_process",
      "exec(",
      "spawn(",
      "systemctl",
      "docker",
      "kubernetes",
      "ACTIVE_RECOVERY_ENABLED",
      "express",
      "router",
      "trpc",
    ]) {
      expect(source.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
