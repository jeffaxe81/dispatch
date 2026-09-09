import { describe, expect, it } from "vitest";
import { authorizeRecoveryAction } from "./activeRecoveryAuthorization";

const request = {
  actionId: "action:decision-1",
  transitionId: "transition-1",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-08T00:00:00.000Z",
  correlationId: "decision-1",
};

const enabledConfig = {
  enabled: true,
  environment: "homologation-controlled" as const,
  authorizedEnvironment: "homologation-controlled" as const,
  authorizedComponent: "database" as const,
  authorizedAction: "restart_component" as const,
  leaseNamespace: "d011b3-v1" as const,
};

const expectedAuthorizationRef = "authz-v1:homologation-controlled:d011b3-v1:database:restart_component:action%3Adecision-1:transition-1:decision-1:2026-09-08T00%3A00%3A00.000Z";

describe("authorizeRecoveryAction", () => {
  it("denies when config is absent", () => {
    expect(authorizeRecoveryAction({ request, config: null }).reasonCode)
      .toBe("AUTHORIZATION_CONFIG_INVALID");
  });

  it("denies when active recovery is disabled", () => {
    expect(authorizeRecoveryAction({
      request,
      config: { ...enabledConfig, enabled: false },
    }).reasonCode).toBe("ACTIVE_RECOVERY_DISABLED");
  });

  it("denies production", () => {
    expect(authorizeRecoveryAction({
      request,
      config: { ...enabledConfig, environment: "production" },
    }).reasonCode).toBe("ENVIRONMENT_NOT_AUTHORIZED");
  });

  it("denies a different component", () => {
    expect(authorizeRecoveryAction({
      request: { ...request, componentId: "storage" },
      config: enabledConfig,
    }).reasonCode).toBe("COMPONENT_NOT_AUTHORIZED");
  });

  it("authorizes only the exact homologation/database/restart tuple and binds the decision to the request identity", () => {
    expect(authorizeRecoveryAction({ request, config: enabledConfig })).toMatchObject({
      authorized: true,
      reasonCode: "AUTHORIZED",
      componentId: "database",
      environment: "homologation-controlled",
      authorizationRef: expectedAuthorizationRef,
    });
  });

  it("changes the authorization reference when the authorized request identity changes", () => {
    const original = authorizeRecoveryAction({ request, config: enabledConfig });
    const changed = authorizeRecoveryAction({
      request: { ...request, transitionId: "transition-2" },
      config: enabledConfig,
    });

    expect(original.authorized).toBe(true);
    expect(changed.authorized).toBe(true);
    expect(original.authorizationRef).toBe(expectedAuthorizationRef);
    expect(changed.authorizationRef).not.toBe(original.authorizationRef);
  });
});
