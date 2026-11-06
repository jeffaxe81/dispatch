import { describe, expect, it } from "vitest";
import {
  credentialSnapshotMatches,
  hashLocalSessionId,
  sessionRegistryAllows,
} from "./localAuthSessions";

const jti = "a".repeat(64);
const identity = { userId: 42, jti, expiresAt: new Date("2026-11-06T12:00:00Z") };
const now = new Date("2026-11-05T12:00:00Z");

describe("persistent local JWT session validation", () => {
  it("stores only the SHA-256 digest of a random jti", () => {
    const digest = hashLocalSessionId(jti);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toBe(jti);
    expect(hashLocalSessionId("b".repeat(64))).not.toBe(digest);
  });

  it.each(["", "abc", "../".repeat(30), "A".repeat(64), "a".repeat(63)])(
    "rejects malformed or noncanonical session identifiers", bad => {
      expect(() => hashLocalSessionId(bad)).toThrow(/inválido/);
    },
  );

  it("requires a locked user row with the SAME verified password hash", () => {
    const snapshot = { active:true, passwordHash:"hash-at-login", lockedUntil:null };
    expect(credentialSnapshotMatches(snapshot, "hash-at-login", now)).toBe(true);
    expect(credentialSnapshotMatches(snapshot, "different-hash", now)).toBe(false);
    expect(credentialSnapshotMatches(undefined, "hash-at-login", now)).toBe(false);
    expect(credentialSnapshotMatches({ ...snapshot, active:false }, "hash-at-login", now)).toBe(false);
    expect(credentialSnapshotMatches({ ...snapshot, passwordHash:null }, "hash-at-login", now)).toBe(false);
    expect(credentialSnapshotMatches({ ...snapshot, lockedUntil:new Date("2026-11-05T12:00:01Z") }, "hash-at-login", now)).toBe(false);
    expect(credentialSnapshotMatches({ ...snapshot, lockedUntil:new Date("2026-11-05T11:59:59Z") }, "hash-at-login", now)).toBe(true);
  });

  it("allows an active session only when identity, expiry and revocation match", () => {
    const row = {
      userId: 42, expiresAt: identity.expiresAt, revokedAt: null,
    };
    expect(sessionRegistryAllows(identity, row, now)).toBe(true);
    expect(sessionRegistryAllows(identity, undefined, now)).toBe(false);
    expect(sessionRegistryAllows(identity, { ...row, userId: 43 }, now)).toBe(false);
    expect(sessionRegistryAllows(identity, { ...row, revokedAt: new Date("2026-11-05T11:00:00Z") }, now)).toBe(false);
    expect(sessionRegistryAllows(identity, { ...row, expiresAt: new Date("2026-11-06T12:00:01Z") }, now)).toBe(false);
    expect(sessionRegistryAllows(identity, row, identity.expiresAt)).toBe(false);
    expect(sessionRegistryAllows(identity, row, new Date("2026-11-07T12:00:00Z"))).toBe(false);
  });
});
