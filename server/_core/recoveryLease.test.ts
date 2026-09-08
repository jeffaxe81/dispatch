import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isValidRecoveryLease,
  type RecoveryLease,
  type RecoveryLeaseAcquireResult,
  type RecoveryLeasePort,
} from "./recoveryLease";

const lease: RecoveryLease = {
  leaseId: "lease-1",
  namespace: "d011b3-v1",
  tenantId: "tenant-7",
  componentId: "database",
  actionId: "action:decision-1",
  ownerId: "replica-a",
  fencingToken: 1,
  acquiredAt: "2026-09-08T00:00:00.000Z",
  expiresAt: "2026-09-08T00:00:30.000Z",
};

describe("RecoveryLease contract", () => {
  it("requires a positive integer fencing token", () => {
    expect(isValidRecoveryLease(lease)).toBe(true);
    expect(isValidRecoveryLease({ ...lease, fencingToken: 0 })).toBe(false);
    expect(isValidRecoveryLease({ ...lease, fencingToken: 1.5 })).toBe(false);
  });

  it("uses closed acquire failure reason codes", () => {
    const results: RecoveryLeaseAcquireResult[] = [
      { acquired: false, reasonCode: "LEASE_HELD" },
      { acquired: false, reasonCode: "LEASE_BACKEND_UNAVAILABLE" },
      { acquired: false, reasonCode: "LEASE_INVALID" },
    ];
    expect(results.map((result) => result.acquired ? null : result.reasonCode)).toEqual([
      "LEASE_HELD",
      "LEASE_BACKEND_UNAVAILABLE",
      "LEASE_INVALID",
    ]);
  });

  it("requires fence validation and owner-scoped release on the port", () => {
    const port: RecoveryLeasePort = {
      acquire: async () => ({ acquired: true, lease }),
      validateFence: async (candidate) => candidate.fencingToken === lease.fencingToken,
      release: async () => undefined,
    };
    expect(typeof port.validateFence).toBe("function");
    expect(typeof port.release).toBe("function");
  });

  it("exports no in-memory production fallback", () => {
    const source = readFileSync(new URL("./recoveryLease.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/createInMemoryRecoveryLease|InMemoryRecoveryLeasePort/);
    expect(source).not.toContain("new Map(");
  });
});
