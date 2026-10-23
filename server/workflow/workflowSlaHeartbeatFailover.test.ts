import { describe, expect, it, vi } from "vitest";
import {
  createSlaHeartbeatManualFailover,
  isSlaHeartbeatExpired,
  slaHeartbeatFailoverAllowed,
  validateSlaHeartbeatHandover,
  type SlaHeartbeatHandover,
} from "./workflowSlaHeartbeatFailover";

const now = "2026-10-22T22:00:00.000Z";
const valid: SlaHeartbeatHandover = {
  organizationId: 9, component: "scheduler", actorUserId: 77,
  expectedSourceId: "primary-one", nextSourceId: "standby-two",
  expectedSequence: 31, nowMs: Date.parse(now), reason: "source_lost",
};
const input = { ...valid, now, operatorApproved: true };
const environment = {
  NODE_ENV: "test", AXE_RUNTIME_ENV: "homologation",
  AXE_SLA_HEARTBEAT_FAILOVER_ENABLED: "true",
};

function deps() {
  const store = { handover: vi.fn(async (_input: SlaHeartbeatHandover) => true) };
  const authorize = vi.fn(async () => true);
  const failover = createSlaHeartbeatManualFailover({ store, authorize, environment });
  return { store, authorize, failover };
}

describe("D-012J J6F — controlled manual SLA failover", () => {
  it("validates strict scope, operator identity, sequence, source change and UTC clock", () => {
    expect(() => validateSlaHeartbeatHandover(valid)).not.toThrow();
    for (const patch of [
      { organizationId: 0 }, { actorUserId: 0 }, { expectedSequence: 0 },
      { expectedSequence: Number.MAX_SAFE_INTEGER }, { nextSourceId: "primary-one" },
      { expectedSourceId: "../danger" }, { nextSourceId: "secret token" },
      { component: "worker" }, { reason: "force" },
      { nowMs: Number.NaN },
    ]) {
      expect(() => validateSlaHeartbeatHandover({ ...valid, ...patch } as never))
        .toThrow(/inválida/i);
    }
  });

  it("is disabled by default or in production, without calling authorization or DB", async () => {
    const f = deps();
    expect(slaHeartbeatFailoverAllowed({})).toBe(false);
    expect(slaHeartbeatFailoverAllowed({ ...environment, NODE_ENV: "production" })).toBe(false);
    expect(slaHeartbeatFailoverAllowed({ ...environment, AXE_RUNTIME_ENV: "development" })).toBe(false);
    expect(slaHeartbeatFailoverAllowed({ ...environment, AXE_SLA_HEARTBEAT_FAILOVER_ENABLED: "false" }))
      .toBe(false);
    const off = createSlaHeartbeatManualFailover({
      store: f.store, authorize: f.authorize,
      environment: { ...environment, NODE_ENV: "production" },
    });
    await expect(off.handover(input)).rejects.toThrow(/desabilitado/i);
    expect(f.authorize).not.toHaveBeenCalled();
    expect(f.store.handover).not.toHaveBeenCalled();
  });

  it("requires explicit operator approval and a second independent authorization decision", async () => {
    const f = deps();
    await expect(f.failover.handover({ ...input, operatorApproved: false }))
      .rejects.toThrow(/aprovação/i);
    expect(f.authorize).not.toHaveBeenCalled();
    f.authorize.mockResolvedValueOnce(false);
    await expect(f.failover.handover(input)).rejects.toThrow(/autorização/i);
    f.authorize.mockRejectedValueOnce(new Error("database password 123"));
    await expect(f.failover.handover(input)).rejects.toThrow("Failover SLA sem autorização.");
    expect(f.store.handover).not.toHaveBeenCalled();
  });

  it("checks operator authorization for the exact tenant and component before takeover", async () => {
    const f = deps();
    await f.failover.handover(input);
    expect(f.authorize).toHaveBeenCalledOnce();
    expect(f.authorize).toHaveBeenCalledWith({
      organizationId: 9, actorUserId: 77, component: "scheduler",
      expectedSourceId: "primary-one", nextSourceId: "standby-two",
      expectedSequence: 31, reason: "source_lost",
    });
    expect(f.store.handover).toHaveBeenCalledOnce();
    expect(f.store.handover).toHaveBeenCalledWith(valid);
  });

  it("rejects conflicts and sanitizes errors without revealing tenant-specific credentials", async () => {
    const f = deps();
    f.store.handover.mockResolvedValueOnce(false);
    await expect(f.failover.handover(input)).rejects.toThrow("Failover SLA rejeitado.");
    f.store.handover.mockRejectedValueOnce(new Error("dsn=mysql://sensitive-secret"));
    await expect(f.failover.handover(input)).rejects.toThrow("Failover SLA rejeitado.");
  });

  it("only considers expired heartbeat evidence safely after 60 seconds", () => {
    const sent = Date.parse(now);
    expect(isSlaHeartbeatExpired(sent, sent)).toBe(false);
    expect(isSlaHeartbeatExpired(sent, sent + 60_000)).toBe(false);
    expect(isSlaHeartbeatExpired(sent, sent + 60_001)).toBe(true);
    expect(isSlaHeartbeatExpired(sent, sent - 1)).toBe(false);
    expect(isSlaHeartbeatExpired(Number.NaN, sent + 100_000)).toBe(false);
  });

  it("does not leak raw DB errors on malformed UTC or missing approval", async () => {
    const f = deps();
    await expect(f.failover.handover({ ...input, now: "2026-02-30T22:00:00.000Z" }))
      .rejects.toThrow(/inválida/i);
    await expect(f.failover.handover({ ...input, now: "2026-10-22 22:00:00" }))
      .rejects.toThrow(/inválida/i);
    expect(f.store.handover).not.toHaveBeenCalled();
  });
});
