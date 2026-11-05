import { createHash } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { localAuthSessions } from "../drizzle/localAuthSessionsSchema";
import { getDb } from "./db";

export type LocalSessionIdentity = {
  userId: number;
  jti: string;
  expiresAt: Date;
};

type PersistedSessionState = {
  userId: number;
  expiresAt: Date;
  revokedAt: Date | null;
};

/** A valid JWT must also have a live, matching registry entry. */
export function sessionRegistryAllows(
  identity: LocalSessionIdentity,
  row: PersistedSessionState | undefined,
  now = new Date(),
): boolean {
  return Boolean(
    row &&
    row.userId === identity.userId &&
    row.revokedAt === null &&
    row.expiresAt.getTime() === identity.expiresAt.getTime() &&
    row.expiresAt.getTime() > now.getTime(),
  );
}

export function hashLocalSessionId(jti: string): string {
  if (!/^[a-f0-9]{64}$/.test(jti)) throw new Error("Identificador da sessão inválido.");
  return createHash("sha256").update(jti, "utf8").digest("hex");
}

async function requireSessionDb() {
  const db = await getDb();
  if (!db) throw new Error("Armazenamento de sessões indisponível.");
  return db;
}

export async function registerLocalAuthSession(identity: LocalSessionIdentity): Promise<void> {
  const hash = hashLocalSessionId(identity.jti);
  const db = await requireSessionDb();
  // If persistence fails, the signed token is NEVER returned to the browser.
  await db.insert(localAuthSessions).values({
    sessionHash: hash,
    userId: identity.userId,
    expiresAt: identity.expiresAt,
  });
}

export async function isLocalAuthSessionActive(identity: LocalSessionIdentity): Promise<boolean> {
  const hash = hashLocalSessionId(identity.jti);
  const db = await requireSessionDb();
  const row = (await db
    .select({
      userId: localAuthSessions.userId,
      expiresAt: localAuthSessions.expiresAt,
      revokedAt: localAuthSessions.revokedAt,
    })
    .from(localAuthSessions)
    .where(eq(localAuthSessions.sessionHash, hash))
    .limit(1))[0];
  return sessionRegistryAllows(identity, row);
}

export async function revokeLocalAuthSession(identity: LocalSessionIdentity): Promise<void> {
  const hash = hashLocalSessionId(identity.jti);
  const db = await requireSessionDb();
  // Idempotent for an already revoked or unknown token. DB failures propagate:
  // logout must NEVER report success without confirming the write.
  await db.update(localAuthSessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(localAuthSessions.sessionHash, hash),
      eq(localAuthSessions.userId, identity.userId),
      isNull(localAuthSessions.revokedAt),
    ));
}

/** Reserved for credential reset, deactivation and administrative revocation. */
export async function revokeAllLocalAuthSessions(userId: number): Promise<void> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Usuário inválido.");
  const db = await requireSessionDb();
  await db.update(localAuthSessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(localAuthSessions.userId, userId),
      isNull(localAuthSessions.revokedAt),
      gt(localAuthSessions.expiresAt, new Date()),
    ));
}

/** Only expired records may be expunged, never active revocations. */
export async function purgeExpiredLocalAuthSessions(now = new Date()): Promise<void> {
  const db = await requireSessionDb();
  await db.delete(localAuthSessions).where(lt(localAuthSessions.expiresAt, now));
}
