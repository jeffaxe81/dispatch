import { describe, expect, it } from "vitest";
import {
  validateRecoveryExecutionRequest,
  validateRecoveryExecutorCapability,
} from "./recoveryExecution";

const validRequest = () => ({
  tenantId: "tenant-7",
  actionId: "action:decision-1",
  transitionId: "transition-1",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-08T12:00:00.000Z",
  correlationId: "decision-1",
  reservationId: "action:decision-1",
  leaseId: "lease-1",
  leaseNamespace: "d011b3-v1" as const,
  ownerId: "instance-a",
  fencingToken: 7,
  authorizationRef: "auth:decision-1",
  deadlineAt: "2026-09-08T12:00:30.000Z",
});

describe("D-011B.4 recovery execution contract", () => {
  it("accepts a fully-bound valid execution request", () => {
    expect(validateRecoveryExecutionRequest(validRequest())).toEqual({ valid: true });
  });

  it.each(["tenantId", "actionId", "componentId", "correlationId", "reservationId", "leaseId", "ownerId", "authorizationRef"] as const)(
    "fails closed when %s is empty",
    (field) => {
      expect(validateRecoveryExecutionRequest({ ...validRequest(), [field]: "" })).toEqual({
        valid: false,
        reasonCode: "EXECUTION_CONTEXT_INVALID",
      });
    },
  );

  it("rejects a non-positive fencing token", () => {
    expect(validateRecoveryExecutionRequest({ ...validRequest(), fencingToken: 0 })).toEqual({
      valid: false,
      reasonCode: "FENCING_TOKEN_INVALID",
    });
  });

  it("rejects an invalid deadline", () => {
    expect(validateRecoveryExecutionRequest({ ...validRequest(), deadlineAt: "not-a-date" })).toEqual({
      valid: false,
      reasonCode: "DEADLINE_INVALID",
    });
  });

  it.each(["simulation", "noop"] as const)("accepts safe executor capability %s", (capability) => {
    expect(validateRecoveryExecutorCapability(capability)).toEqual({ valid: true });
  });

  it.each(["real", "docker", "systemd", "kubernetes", "unknown"])(
    "rejects unsafe/unknown executor capability %s",
    (capability) => {
      expect(validateRecoveryExecutorCapability(capability)).toEqual({
        valid: false,
        reasonCode: "REAL_EXECUTOR_FORBIDDEN",
      });
    },
  );
});
