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
import { assignTeamToIncident, assignUserRole, createAccessRole, respondToAssignment, setUserLocalCredentials, transitionIncident, updateAccessRole } from "../../server/db";

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
  let unrelatedUserId: number | null = null;
  let incidentId: number | null = null;
  let teamId: number | null = null;
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

    // Critical operational mutation smoke: the transaction must still own a
    // live, non-revoked session at the exact write boundary.
    const teamCode = "CI" + randomUUID().replaceAll("-", "").slice(0, 20);
    const [teamInsert] = await independent.execute<ResultSetHeader>(
      "INSERT INTO teams (code, name, agency) VALUES (?, ?, ?)",
      [teamCode, "Isolated dispatch auth team", "CI"],
    );
    teamId = teamInsert.insertId;
    const incidentCode = "CI" + randomUUID().replaceAll("-", "").slice(0, 20);
    const [incidentInsert] = await independent.execute<ResultSetHeader>(
      "INSERT INTO incidents (code, status, priority, category, origin, description, address, latitude, longitude, created_by_user_id) VALUES (?, 'triagem', 'media', ?, 'central', ?, ?, ?, ?, ?)",
      [incidentCode, "Homologation", "Isolated session write boundary scenario", "CI isolated address", "-27.0", "-48.0", userId],
    );
    incidentId = incidentInsert.insertId;
    const liveOperationalSession = await verifyLocalSessionToken(token2);
    assert.ok(liveOperationalSession);
    const queued = await transitionIncident({
      incidentId, actorUserId: userId, nextStatus: "aguardando_despacho",
      note: "Isolated session validation before transition",
      session: liveOperationalSession,
    });
    assert.equal(queued.status, "aguardando_despacho");
    const dispatched = await assignTeamToIncident({
      incidentId, teamId, actorUserId: userId, session: liveOperationalSession,
    });
    assert.equal(dispatched.status, "despachada");
    const accepted = await respondToAssignment({
      incidentId, teamId, actorUserId: userId, accepted: true,
      note: "Operational session guard confirmed", session: liveOperationalSession,
    });
    assert.equal(accepted.status, "aceita");

    // A concurrent logout wins the session-row lock: the operation must wait
    // and abort after revocation, leaving status unchanged.
    const conflictingSession = await verifyLocalSessionToken(token3);
    assert.ok(conflictingSession);
    await independent.beginTransaction();
    await independent.execute(
      "UPDATE local_auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_hash = ?",
      [hashLocalSessionId(conflictingSession.jti)],
    );
    const pendingTransition = transitionIncident({
      incidentId, actorUserId: userId, nextStatus: "em_atendimento",
      note: "This transition must fail after the concurrent logout",
      session: conflictingSession,
    });
    // Attach a rejection handler immediately while another transaction owns the lock.
    const pendingOutcome = pendingTransition.then(
      () => "accepted" as const, () => "rejected" as const,
    );
    await new Promise(resolve => setTimeout(resolve, 100));
    await independent.commit();
    assert.equal(await pendingOutcome, "rejected");
    const [stillAccepted] = await independent.execute<RowDataPacket[]>(
      "SELECT status FROM incidents WHERE id = ?", [incidentId],
    );
    assert.equal(stillAccepted[0]?.status, "aceita");

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

    // Assigning a new profile must invalidate ALL prior sessions atomically.
    const role = await createAccessRole({
      code: "session_ci_" + randomUUID().slice(0, 12),
      name: "Ephemeral auth test role",
      defaultScope: "global",
      permissionIds: [],
      actorUserId: userId,
    });
    const beforeAssign = await createLocalSessionToken(userId, newHash);
    const assigned = await assignUserRole({
      userId,
      roleId: role.id,
      actorUserId: userId,
    });
    assert.ok(assigned.id > 0);
    assert.equal(await authenticateLocalRequest({
      headers: { cookie: COOKIE_NAME + "=" + beforeAssign },
    } as Request), null, "old session must be revoked after profile replacement");

    // A role's shared policy affects each current assignee.
    // Description-only edits must NOT log the user out.
    const beforeDisplayChange = await createLocalSessionToken(userId, newHash);
    await updateAccessRole({
      roleId: role.id,
      name: "Renamed ephemeral auth test role",
      actorUserId: userId,
    });
    assert.equal((await authenticateLocalRequest({
      headers: { cookie: COOKIE_NAME + "=" + beforeDisplayChange },
    } as Request))?.id, userId, "presentation-only role change must preserve the session");

    // A shared role change must never revoke an unrelated user's session.
    const unrelatedUsername = "auth_other_" + randomUUID().slice(0, 12);
    const [unrelatedInsert] = await independent.execute<ResultSetHeader>(
      "INSERT INTO users (openId, username, password_hash, loginMethod) VALUES (?, ?, ?, ?)",
      ["local:" + unrelatedUsername, unrelatedUsername, newHash, "local_password"],
    );
    unrelatedUserId = unrelatedInsert.insertId;
    const unrelatedToken = await createLocalSessionToken(unrelatedUserId, newHash);
    assert.equal((await authenticateLocalRequest({
      headers: { cookie: COOKIE_NAME + "=" + unrelatedToken },
    } as Request))?.id, unrelatedUserId);

    // Changing scope/active/permission matrix MUST revoke current sessions.
    await updateAccessRole({
      roleId: role.id,
      defaultScope: "organizacao",
      actorUserId: userId,
    });
    assert.equal(await authenticateLocalRequest({
      headers: { cookie: COOKIE_NAME + "=" + beforeDisplayChange },
    } as Request), null, "security-sensitive role update must revoke assigned sessions");
    assert.equal((await authenticateLocalRequest({
      headers: { cookie: COOKIE_NAME + "=" + unrelatedToken },
    } as Request))?.id, unrelatedUserId, "other users must not be revoked by unrelated role updates");

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
    console.log("PASS: MySQL 8.4 sessions, dispatch transitions/assignment/acceptance, concurrent revocation, replay, RBAC changes, reset, fail-closed.");
  } finally {
    if (lockConnection) {
      await lockConnection.rollback().catch(() => {});
      await lockConnection.end().catch(() => {});
    }
    if (sessionTableTemporarilyRenamed)
      await independent.query("RENAME TABLE local_auth_sessions_smoke_unavailable TO local_auth_sessions").catch(() => {});
    if (incidentId !== null)
      await independent.execute("DELETE FROM incidents WHERE id = ?", [incidentId]).catch(() => {});
    if (teamId !== null)
      await independent.execute("DELETE FROM teams WHERE id = ?", [teamId]).catch(() => {});
    if (unrelatedUserId !== null)
      await independent.execute("DELETE FROM users WHERE id = ?", [unrelatedUserId]).catch(() => {});
    if (userId !== null)
      await independent.execute("DELETE FROM users WHERE id = ?", [userId]).catch(() => {});
    await independent.end();
  }
}

// Drizzle's production-style pool intentionally keeps idle connections open;
// this one-shot CI smoke exits only AFTER all assertions and cleanup completed.
void main().then(
  () => { process.stdout.write("Session MySQL smoke finished.\\n", () => process.exit(0)); },
  error => {
    const message = error instanceof Error ? error.stack ?? error.message : "unknown";
    process.stderr.write("Isolated session registry MySQL validation failed: " + message + "\\n", () => process.exit(1));
  },
);
