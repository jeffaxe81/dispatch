import { createHash } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { localAuthSessions } from "../drizzle/localAuthSessionsSchema";
import { users } from "../drizzle/schema";
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

type LockedMutationActor = { id: number; active: boolean };
type LockedSessionRecord = { userId: number; expiresAt: Date; revokedAt: Date | null };

/**
 * Serialize critical operational writes with logout, password reset and RBAC
 * revocation. The caller MUST use a single MySQL transaction for the locks,
 * subsequent writes, and commit. Lock user BEFORE session for consistent order.
 */
export async function assertOperationalSessionAtWriteBoundary(input: {
  identity: LocalSessionIdentity;
  actorUserId: number;
  lockUser: () => Promise<LockedMutationActor | undefined>;
  lockSession: () => Promise<LockedSessionRecord | undefined>;
  now?: Date;
}): Promise<void> {
  const { identity, actorUserId } = input;
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0 || identity.userId !== actorUserId)
    throw new Error("Sessão de operação inválida. Entre novamente.");
  hashLocalSessionId(identity.jti);
  const user = await input.lockUser();
  if (!user?.active || user.id !== actorUserId)
    throw new Error("Acesso operacional revogado. Entre novamente.");
  const record = await input.lockSession();
  if (!sessionRegistryAllows(identity, record, input.now))
    throw new Error("Sessão expirada ou revogada. Entre novamente.");
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

type CredentialSnapshot = { active: boolean; passwordHash: string | null; lockedUntil: Date | null };

/**
 * A login verified against an OLD password must not issue a session after an
 * administrator has changed that password. The users row is locked until the
 * new session is committed; credential changes update that same row first.
 */
export function credentialSnapshotMatches(
  snapshot: CredentialSnapshot | undefined,
  expectedPasswordHash: string,
  now = new Date(),
): boolean {
  return Boolean(
    snapshot?.active &&
    snapshot.passwordHash &&
    snapshot.passwordHash === expectedPasswordHash &&
    (!snapshot.lockedUntil || snapshot.lockedUntil <= now),
  );
}

export async function registerLocalAuthSession(
  identity: LocalSessionIdentity,
  expectedPasswordHash: string,
): Promise<void> {
  const hash = hashLocalSessionId(identity.jti);
  if (!expectedPasswordHash || typeof expectedPasswordHash !== "string")
    throw new Error("Credenciais de sessão inválidas.");
  const db = await requireSessionDb();
  // Atomic with administrative password updates that modify the same users
  // row. No session is issued for credentials superseded during login.
  await db.transaction(async tx => {
    const current = (await tx.select({
      active: users.active,
      passwordHash: users.passwordHash,
      lockedUntil: users.lockedUntil,
    })
      .from(users)
      .where(eq(users.id, identity.userId))
      .limit(1)
      .for("update"))[0];
    if (!credentialSnapshotMatches(current, expectedPasswordHash))
      throw new Error("Credenciais alteradas durante a autenticação. Entre novamente.");
    await tx.insert(localAuthSessions).values({
      sessionHash: hash,
      userId: identity.userId,
      expiresAt: identity.expiresAt,
    });
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
