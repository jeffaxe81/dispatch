import { describe, expect, it, vi } from "vitest";
import { decodeJwt } from "jose";
import { createLocalSessionToken, verifyLocalSessionToken } from "./localAuth";
import {
  digestLocalSessionToken,
  isLocalSessionRevoked,
  revokeLocalSessionToken,
  type SessionRevocationRecord,
  type SessionRevocationStore,
} from "./localSessionRevocation";

function memoryStore(): SessionRevocationStore & { entries: Map<string, SessionRevocationRecord> } {
  const entries = new Map<string, SessionRevocationRecord>();
  return {
    entries,
    async isRevoked(hash) { return entries.has(hash); },
    async revoke(record) { entries.set(record.tokenHash, record); },
  };
}

describe("durable local JWT revocation service (pre-production)", () => {
  it("issues distinct jti values, even for two logins within the same second", async () => {
    const first = await createLocalSessionToken(42);
    const second = await createLocalSessionToken(42);
    expect(first).not.toBe(second);
    expect(decodeJwt(first).jti).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(decodeJwt(first).jti).not.toEqual(decodeJwt(second).jti);
    expect(decodeJwt(first).exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("stores only a one-way digest, not the original bearer JWT", async () => {
    const jwt = await createLocalSessionToken(42);
    const digest = digestLocalSessionToken(jwt);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(jwt);
    expect(digestLocalSessionToken(jwt)).toBe(digest);
    expect(digestLocalSessionToken(jwt + "changed")).not.toBe(digest);
  });

  it("rejects missing or huge token inputs before persistence", () => {
    expect(() => digestLocalSessionToken("")).toThrow();
    expect(() => digestLocalSessionToken("x".repeat(8193))).toThrow();
  });

  it("disables replay after idempotent revocation, without affecting another session", async () => {
    const store = memoryStore();
    const first = await createLocalSessionToken(42);
    const second = await createLocalSessionToken(42);
    const expiry = new Date((decodeJwt(first).exp ?? 0) * 1000);
    expect(await isLocalSessionRevoked(first, store)).toBe(false);
    expect(await isLocalSessionRevoked(second, store)).toBe(false);
    await revokeLocalSessionToken(first, 42, expiry, store);
    await revokeLocalSessionToken(first, 42, expiry, store);
    expect(store.entries.size).toBe(1);
    expect(store.entries.get(digestLocalSessionToken(first))).toMatchObject({ userId: 42, expiresAt: expiry });
    expect(await isLocalSessionRevoked(first, store)).toBe(true);
    expect(await isLocalSessionRevoked(second, store)).toBe(false);
    expect(await verifyLocalSessionToken(first)).toEqual({ kind: "local", userId: 42 });
    // Signature validation alone is insufficient: handlers must query the denylist.
  });

  it("propagates database failures rather than assuming a session remains authorized", async () => {
    const jwt = await createLocalSessionToken(42);
    const unavailable: SessionRevocationStore = {
      isRevoked: vi.fn().mockRejectedValue(new Error("database unavailable")),
      revoke: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };
    await expect(isLocalSessionRevoked(jwt, unavailable)).rejects.toThrow("database unavailable");
    await expect(revokeLocalSessionToken(jwt, 42, new Date(Date.now() + 3600000), unavailable))
      .rejects.toThrow("database unavailable");
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid user ID %s for revocation", async userId => {
      await expect(revokeLocalSessionToken("synthetic", userId, new Date(Date.now() + 60000), memoryStore()))
        .rejects.toThrow("Metadados");
    },
  );

  it("rejects invalid expiration timestamps", async () => {
    await expect(revokeLocalSessionToken("synthetic", 42, new Date(Number.NaN), memoryStore()))
      .rejects.toThrow("Metadados");
  });

  it("retains legacy no-jti sessions as individually hash-addressable", async () => {
    const store = memoryStore();
    const legacy = "legacy-signed-jwt-no-jti";
    await revokeLocalSessionToken(legacy, 42, new Date(Date.now() + 3600000), store);
    expect(await isLocalSessionRevoked(legacy, store)).toBe(true);
    expect(store.entries.values().next().value?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
