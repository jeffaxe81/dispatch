import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { localRevokedSessions } from "../drizzle/localSessionRevocationSchema";
import { getDb } from "./db";

/** Never persist/log bearer credentials: retain only SHA-256 of the signed JWT. */
export function digestLocalSessionToken(token: string): string {
  if (!token || typeof token !== "string" || token.length > 8192) {
    throw new Error("Token de sessão inválido.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type SessionRevocationRecord = {
  tokenHash: string;
  userId: number;
  expiresAt: Date;
};

export type SessionRevocationStore = {
  isRevoked(hash: string): Promise<boolean>;
  revoke(record: SessionRevocationRecord): Promise<void>;
};

const mysqlStore: SessionRevocationStore = {
  async isRevoked(hash) {
    const db = await getDb();
    if (!db) throw new Error("Persistência de revogação de sessão indisponível.");
    const rows = await db.select({ hash: localRevokedSessions.tokenHash })
      .from(localRevokedSessions)
      .where(eq(localRevokedSessions.tokenHash, hash))
      .limit(1);
    return rows.length > 0;
  },

  async revoke(record) {
    const db = await getDb();
    if (!db) throw new Error("Persistência de revogação de sessão indisponível.");
    await db.insert(localRevokedSessions).values(record)
      .onDuplicateKeyUpdate({ set: { expiresAt: record.expiresAt } });
  },
};

/**
 * One shared MySQL denylist across all web instances.
 * A storage/query failure MUST propagate: authentication can only fail closed.
 */
export async function isLocalSessionRevoked(
  token: string, store: SessionRevocationStore = mysqlStore,
): Promise<boolean> {
  return store.isRevoked(digestLocalSessionToken(token));
}

/** Idempotent, durable invalidation confirmed before logout succeeds. */
export async function revokeLocalSessionToken(
  token: string, userId: number, expiresAt: Date,
  store: SessionRevocationStore = mysqlStore,
): Promise<void> {
  if (!Number.isSafeInteger(userId) || userId < 1 ||
      !(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())) {
    throw new Error("Metadados de sessão inválidos.");
  }
  await store.revoke({ tokenHash: digestLocalSessionToken(token), userId, expiresAt });
}
