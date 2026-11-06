import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { registerLocalAuthSession } from "./localAuthSessions";

vi.mock("./db", () => ({ getDb: vi.fn() }));

const identity = {
  userId: 42,
  jti: "b".repeat(64),
  expiresAt: new Date("2026-11-06T10:00:00.000Z"),
};

type CredentialRow = {
  active: boolean;
  passwordHash: string | null;
  lockedUntil: Date | null;
};

function fakeDatabase(row: CredentialRow | undefined, failInsert = false) {
  const trace: string[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: async (mode: string) => {
              trace.push("lock:" + mode);
              return row ? [row] : [];
            },
          }),
        }),
      }),
    }),
    insert: () => ({
      values: async (data: { sessionHash: string; userId: number }) => {
        trace.push("insert");
        expect(data.userId).toBe(42);
        expect(data.sessionHash).toMatch(/^[a-f0-9]{64}$/);
        expect(data.sessionHash).not.toBe(identity.jti);
        if (failInsert) throw new Error("mysql write failed");
      },
    }),
  };
  const database = {
    transaction: async (work: (tx: typeof tx) => Promise<void>) => {
      trace.push("transaction:start");
      await work(tx);
      trace.push("transaction:commit");
    },
  };
  vi.mocked(getDb).mockResolvedValue(database as never);
  return trace;
}

describe("atomic local JWT session registration", () => {
  beforeEach(() => vi.mocked(getDb).mockReset());

  it("locks the account row before inserting the session within a transaction", async () => {
    const trace = fakeDatabase({ active: true, passwordHash: "verified-hash", lockedUntil: null });
    await expect(registerLocalAuthSession(identity, "verified-hash")).resolves.toBeUndefined();
    expect(trace).toEqual(["transaction:start", "lock:update", "insert", "transaction:commit"]);
  });

  it("never persists a session when the password was replaced mid-login", async () => {
    const trace = fakeDatabase({ active: true, passwordHash: "new-hash", lockedUntil: null });
    await expect(registerLocalAuthSession(identity, "old-hash")).rejects.toThrow(/Credenciais alteradas/);
    expect(trace).toEqual(["transaction:start", "lock:update"]);
  });

  it("does not issue a session for deactivated or deleted accounts", async () => {
    for (const account of [
      { active: false, passwordHash: "verified-hash", lockedUntil: null },
      undefined,
    ]) {
      const trace = fakeDatabase(account);
      await expect(registerLocalAuthSession(identity, "verified-hash")).rejects.toThrow(/Credenciais alteradas/);
      expect(trace).toEqual(["transaction:start", "lock:update"]);
    }
  });

  it("does not commit or issue a token after a failed MySQL insert", async () => {
    const trace = fakeDatabase({ active: true, passwordHash: "verified-hash", lockedUntil: null }, true);
    await expect(registerLocalAuthSession(identity, "verified-hash")).rejects.toThrow("mysql write failed");
    expect(trace).toEqual(["transaction:start", "lock:update", "insert"]);
  });

  it("blocks when expected credential proof is missing or the database is unavailable", async () => {
    await expect(registerLocalAuthSession(identity, "")).rejects.toThrow(/inválidas/);
    expect(getDb).not.toHaveBeenCalled();
    vi.mocked(getDb).mockResolvedValueOnce(null);
    await expect(registerLocalAuthSession(identity, "verified-hash")).rejects.toThrow(/indisponível/);
  });
});
