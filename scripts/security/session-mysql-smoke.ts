/**
 * Isolated MySQL 8.4 integration smoke. This deliberately writes to a test DB.
 * Guard rails prevent accidental execution against any real client database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import mysql, { type Connection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { COOKIE_NAME } from "../../shared/const";
import {
  authenticateLocalRequest,
  createLocalSessionToken,
  hashLocalPassword,
  loginWithLocalCredentials,
  revokeLocalSessionFromRequest,
  verifyLocalSessionToken,
} from "../../server/localAuth";
import {
  hashLocalSessionId,
  isLocalAuthSessionActive,
  revokeAllLocalAuthSessions,
} from "../../server/localAuthSessions";
import { setUserLocalCredentials } from "../../server/db";

function guardedTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? "";
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Test DATABASE_URL is invalid."); }
  if (process.env.SESSION_AUTH_MYSQL_SMOKE !== "1" ||
      process.env.NODE_ENV !== "test" ||
      parsed.protocol !== "mysql:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
      parsed.pathname !== "/dispatch_auth_ci") {
    throw new Error("Refusing session integration smoke outside isolated local CI database.");
  }
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32)
    throw new Error("CI needs a random JWT_SECRET (>=32 bytes).");
  return url;
}

async function main(): Promise<void> {
  const url = guardedTestDatabaseUrl();
  // Independent connection simulates a second node observing the shared registry.
  const independent = await mysql.createConnection(url);
  let userId: number | null = null;
  let lockConnection: Connection | undefined;
  let sessionTableTemporarilyRenamed = false;
  try {
    const [dbNameRows] = await independent.query<RowDataPacket[]>("SELECT DATABASE() AS db_name");
    assert.equal(dbNameRows[0]?.db_name, "dispatch_auth_ci");
    const username = "auth_smoke_" + randomUUID().slice(0, 12);
    const password = "ci-password-" + randomUUID();
    const initialHash = await hashLocalPassword(password);
    const [insert] = await independent.execute<ResultSetHeader>(
      "INSERT INTO users (openId, username, password_hash, loginMethod) VALUES (?, ?, ?, ?)",
      ["local:" + username, username, initialHash, "local_password"],
    );
    userId = insert.insertId;
    assert.ok(userId > 0);

    const user = await loginWithLocalCredentials({ username, password });
    assert.equal(user.id, userId);
    const token = await createLocalSessionToken(user.id, user.passwordHash!);
    const identity = await verifyLocalSessionToken(token);
    assert.ok(identity);
    const request = { headers: { cookie: COOKIE_NAME + "=" + token } } as Request;
    assert.equal((await authenticateLocalRequest(request))?.id, userId);

    const [records] = await independent.execute<RowDataPacket[]>(
      "SELECT session_hash, user_id, revoked_at FROM local_auth_sessions WHERE user_id = ?",
      [userId],
    );
    assert.equal(records.length, 1);
    assert.equal(records[0].session_hash, hashLocalSessionId(identity.jti));
    assert.equal(records[0].user_id, userId);
    assert.equal(records[0].revoked_at, null);
    assert.equal(records[0].session_hash.includes(token), false);

    // Revocation must be visible through a fresh physical MySQL connection.
    await revokeLocalSessionFromRequest(request);
    assert.equal(await isLocalAuthSessionActive(identity), false);
    assert.equal(await authenticateLocalRequest(request), null);
    await revokeLocalSessionFromRequest(request); // Idempotent.
    const [revoked] = await independent.execute<RowDataPacket[]>(
      "SELECT revoked_at FROM local_auth_sessions WHERE session_hash = ?",
      [hashLocalSessionId(identity.jti)],
    );
    assert.ok(revoked[0]?.revoked_at);

    // A password change revokes all sessions in the SAME transaction.
    const token2 = await createLocalSessionToken(userId, initialHash);
    const token3 = await createLocalSessionToken(userId, initialHash);
    const newPassword = "ci-replacement-" + randomUUID();
    const newHash = await hashLocalPassword(newPassword);
    await setUserLocalCredentials({
      userId, username, passwordHash: newHash, actorUserId: userId,
    });
    assert.equal(await authenticateLocalRequest({
      headers: { cookie: COOKIE_NAME + "=" + token2 },
    } as Request), null);
    assert.equal(await authenticateLocalRequest({
      headers: { cookie: COOKIE_NAME + "=" + token3 },
    } as Request), null);
    await assert.rejects(loginWithLocalCredentials({ username, password }));
    const reauthenticated = await loginWithLocalCredentials({ username, password: newPassword });
    assert.equal(reauthenticated.id, userId);

    // Deterministic race: while an administrator locks the user row and
    // rotates credentials, another node tries to register an OLD snapshot.
    lockConnection = await mysql.createConnection(url);
    await lockConnection.beginTransaction();
    await lockConnection.execute("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
    const pending = createLocalSessionToken(userId, newHash);
    // Avoid unhandled rejection while transaction A holds the lock.
    const pendingResult = pending.then(() => "accepted" as const, () => "rejected" as const);
    await new Promise(resolve => setTimeout(resolve, 150));
    await lockConnection.execute(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [await hashLocalPassword("ci-racing-" + randomUUID()), userId],
    );
    await lockConnection.commit();
    assert.equal(await pendingResult, "rejected");
    await lockConnection.end();
    lockConnection = undefined;

    // Fail closed if the session registry disappears; never accept a JWT by
    // cryptographic signature alone when the shared store is unavailable.
    const [latest] = await independent.execute<RowDataPacket[]>(
      "SELECT password_hash FROM users WHERE id = ?", [userId],
    );
    const newest = await createLocalSessionToken(userId, String(latest[0]?.password_hash));
    const newestReq = { headers: { cookie: COOKIE_NAME + "=" + newest } } as Request;
    assert.equal((await authenticateLocalRequest(newestReq))?.id, userId);
    await independent.query("RENAME TABLE local_auth_sessions TO local_auth_sessions_smoke_unavailable");
    sessionTableTemporarilyRenamed = true;
    await assert.rejects(authenticateLocalRequest(newestReq));
    await independent.query("RENAME TABLE local_auth_sessions_smoke_unavailable TO local_auth_sessions");
    sessionTableTemporarilyRenamed = false;

    await revokeAllLocalAuthSessions(userId);
    assert.equal(await authenticateLocalRequest(newestReq), null);
    console.log("PASS: MySQL 8.4 session migration, replay, logout, cross-connection, reset, race, fail-closed.");
  } finally {
    if (lockConnection) {
      await lockConnection.rollback().catch(() => {});
      await lockConnection.end().catch(() => {});
    }
    if (sessionTableTemporarilyRenamed)
      await independent.query("RENAME TABLE local_auth_sessions_smoke_unavailable TO local_auth_sessions").catch(() => {});
    if (userId !== null)
      await independent.execute("DELETE FROM users WHERE id = ?", [userId]).catch(() => {});
    await independent.end();
  }
}

main().catch(error => {
  console.error("Isolated session registry MySQL validation failed:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
