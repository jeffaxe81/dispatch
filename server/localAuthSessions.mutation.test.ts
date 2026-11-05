import { describe, expect, it, vi } from "vitest";
import {
  assertOperationalSessionAtWriteBoundary,
  type LocalSessionIdentity,
} from "./localAuthSessions";

const identity: LocalSessionIdentity = {
  userId: 42,
  jti: "a".repeat(64),
  expiresAt: new Date("2026-11-08T12:00:00.000Z"),
};
const now = new Date("2026-11-06T12:00:00.000Z");
const live = { userId: 42, expiresAt: identity.expiresAt, revokedAt: null };

function guardedScenario(input: {
  user?: { id: number; active: boolean };
  session?: typeof live;
  failUser?: boolean;
  failSession?: boolean;
} = {}) {
  const trace: string[] = [];
  const lockUser = vi.fn(async () => {
    trace.push("lock:user");
    if (input.failUser) throw new Error("user lock unavailable");
    return "user" in input ? input.user : { id: 42, active: true };
  });
  const lockSession = vi.fn(async () => {
    trace.push("lock:session");
    if (input.failSession) throw new Error("session table unavailable");
    return "session" in input ? input.session : live;
  });
  return { trace, lockUser, lockSession };
}

describe("guard against in-flight session and RBAC revocation", () => {
  it("locks user before session and accepts only the current active registry entry", async () => {
    const scenario = guardedScenario();
    await expect(assertOperationalSessionAtWriteBoundary({
      identity, actorUserId: 42, ...scenario, now,
    })).resolves.toBeUndefined();
    expect(scenario.trace).toEqual(["lock:user", "lock:session"]);
  });

  it("rejects an impersonated actor without touching the database", async () => {
    const scenario = guardedScenario();
    await expect(assertOperationalSessionAtWriteBoundary({
      identity, actorUserId: 43, ...scenario, now,
    })).rejects.toThrow(/inválida/);
    expect(scenario.trace).toEqual([]);
  });

  it.each([
    ["disabled", { id: 42, active: false }],
    ["deleted", undefined],
    ["wrong account", { id: 43, active: true }],
  ])("rejects a %s user before opening the session registry", async (_, user) => {
    const scenario = guardedScenario({ user });
    await expect(assertOperationalSessionAtWriteBoundary({
      identity, actorUserId: 42, ...scenario, now,
    })).rejects.toThrow(/revogado/);
    expect(scenario.trace).toEqual(["lock:user"]);
  });

  it.each([
    ["missing", undefined],
    ["revoked", { ...live, revokedAt: new Date("2026-11-06T11:00:00.000Z") }],
    ["other user", { ...live, userId: 43 }],
    ["wrong expiry", { ...live, expiresAt: new Date("2026-11-08T12:00:01.000Z") }],
  ])("rejects a %s registry row before allowing a write", async (_, session) => {
    const scenario = guardedScenario({ session });
    await expect(assertOperationalSessionAtWriteBoundary({
      identity, actorUserId: 42, ...scenario, now,
    })).rejects.toThrow(/revogada/);
    expect(scenario.trace).toEqual(["lock:user", "lock:session"]);
  });

  it("fails closed on expiry and datastore outages", async () => {
    const expired = guardedScenario();
    await expect(assertOperationalSessionAtWriteBoundary({
      identity, actorUserId: 42, ...expired, now: identity.expiresAt,
    })).rejects.toThrow(/revogada/);
    const missingUserStore = guardedScenario({ failUser: true });
    await expect(assertOperationalSessionAtWriteBoundary({
      identity, actorUserId: 42, ...missingUserStore, now,
    })).rejects.toThrow(/user lock unavailable/);
    const missingSessionStore = guardedScenario({ failSession: true });
    await expect(assertOperationalSessionAtWriteBoundary({
      identity, actorUserId: 42, ...missingSessionStore, now,
    })).rejects.toThrow(/session table unavailable/);
  });
});
