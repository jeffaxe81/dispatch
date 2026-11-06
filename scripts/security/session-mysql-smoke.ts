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
import { addIncidentEvidence, assignTeamToIncident, assignUserRole, createAccessRole, createIncident, listEvidenceReconciliationCandidates, permanentlyDeleteIncident, respondToAssignment, setUserLocalCredentials, transitionIncident, updateAccessRole, updateIncident } from "../../server/db";

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
  if (process.env.BUILT_IN_FORGE_API_URL !== "http://127.0.0.1:8765" ||
      process.env.BUILT_IN_FORGE_API_KEY !== "ci-synthetic-storage-only")
    throw new Error("Synthetic Forge tests must use the loopback-only CI configuration.");
  const previousFetch = globalThis.fetch;
  const uploads: string[] = [];
  let revokeDuringNextUpload: (() => Promise<void>) | null = null;
  // Never contact a provider: this test intercepts the synthetic loopback host.
  globalThis.fetch = async (resource, options) => {
    const target = new URL(typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url);
    if (target.origin !== "http://127.0.0.1:8765")
      throw new Error("Evidence smoke blocked non-synthetic storage network request.");
    if (target.pathname === "/v1/storage/presign/put") {
      const key = target.searchParams.get("path");
      assert.ok(key?.startsWith("incident-evidence/"));
      return new Response(JSON.stringify({
        url: "http://127.0.0.1:8765/synthetic-put/" + encodeURIComponent(key),
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (target.pathname.startsWith("/synthetic-put/") && options?.method === "PUT") {
      uploads.push(decodeURIComponent(target.pathname.slice("/synthetic-put/".length)));
      const action = revokeDuringNextUpload;
      revokeDuringNextUpload = null;
      if (action) await action();
      return new Response(null, { status: 200 });
    }
    throw new Error("Unrecognized synthetic storage operation.");
  };
  // Independent connection simulates a second node observing the shared registry.
  const independent = await mysql.createConnection(url);
  let userId: number | null = null;
  let unrelatedUserId: number | null = null;
  let incidentId: number | null = null;
  let newIncidentId: number | null = null;
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
      "INSERT INTO incidents (code, incident_status, incident_priority, category, incident_origin, description, address, latitude, longitude, created_by_user_id) VALUES (?, 'triagem', 'media', ?, 'central', ?, ?, ?, ?, ?)",
      [incidentCode, "Homologation", "Isolated session write boundary scenario", "CI isolated address", "-27.0", "-48.0", userId],
    );
    incidentId = incidentInsert.insertId;
    const liveOperationalSession = await verifyLocalSessionToken(token2);
    assert.ok(liveOperationalSession);
    // Create, update and delete must share the live-session write boundary.
    const creationInput = {
      actorUserId: userId,
      category: "Protected creation",
      priority: "media" as const,
      origin: "central" as const,
      description: "Generated inside disposable MySQL session smoke",
      address: "Isolated CI address",
      latitude: -27.1,
      longitude: -48.9,
      session: liveOperationalSession,
    };
    const created = await createIncident(creationInput);
    newIncidentId = created.id;
    assert.equal(created.status, "triagem");
    const edited = await updateIncident({
      incidentId: created.id, actorUserId: userId,
      description: "Edited with valid durable JWT session",
      session: liveOperationalSession,
    });
    assert.equal(edited.description, "Edited with valid durable JWT session");

    // A failed tenant reference must roll back the incident and its audit.
    const [countBeforeInvalidTenant] = await independent.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM incidents",
    );
    await assert.rejects(createIncident({
      ...creationInput,
      organizationId: 2147483647, // Missing FK in the disposable CI database.
    }));
    const [countAfterInvalidTenant] = await independent.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM incidents",
    );
    assert.equal(countAfterInvalidTenant[0]?.n, countBeforeInvalidTenant[0]?.n,
      "failed tenant FK cannot leave an unscoped incident behind");

    const deleted = await permanentlyDeleteIncident({
      incidentId: created.id, actorUserId: userId,
      reason: "Test-only irreversible deletion with audit",
      session: liveOperationalSession,
    });
    assert.equal(deleted.auditPreserved, true);
    newIncidentId = null;
    const [afterDeletion] = await independent.execute<RowDataPacket[]>(
      "SELECT id FROM incidents WHERE id = ?", [created.id],
    );
    assert.equal(afterDeletion.length, 0);

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
      "SELECT incident_status AS status FROM incidents WHERE id = ?", [incidentId],
    );
    assert.equal(stillAccepted[0]?.status, "aceita");

    // All three new write paths must reject the revoked token as well.
    await assert.rejects(createIncident({ ...creationInput, session: conflictingSession }));
    await assert.rejects(updateIncident({
      incidentId, actorUserId: userId,
      description: "This unauthorized update must not commit",
      session: conflictingSession,
    }));
    await assert.rejects(permanentlyDeleteIncident({
      incidentId, actorUserId: userId,
      reason: "This unauthorized delete must not commit",
      session: conflictingSession,
    }));
    const [untouched] = await independent.execute<RowDataPacket[]>(
      "SELECT incident_status AS status, description FROM incidents WHERE id = ?", [incidentId],
    );
    assert.equal(untouched[0]?.status, "aceita");
    assert.equal(untouched[0]?.description, "Isolated session write boundary scenario");

    // File upload writes a DURABLE reservation before the (fake) remote PUT.
    // It is only published after a second authorization check at commit.
    await independent.execute(
      "UPDATE users SET operational_role = 'agente', teamId = ? WHERE id = ?",
      [teamId, userId],
    );
    const syntheticPdf = Buffer.from("%PDF-1.4\\n%%EOF\\n").toString("base64");
    const evidenceInput = {
      incidentId, actorUserId: userId, teamId,
      fileName: "isolated-evidence.pdf",
      contentType: "application/pdf",
      dataBase64: syntheticPdf,
      session: liveOperationalSession,
    };
    // An incident without the selected tenant scope cannot upload at all.
    const beforeTenantRejection = uploads.length;
    await assert.rejects(addIncidentEvidence({
      ...evidenceInput, expectedTenantId: 2147483647,
    }));
    assert.equal(uploads.length, beforeTenantRejection,
      "tenant scope mismatch must be rejected before an external PUT");

    const successfulEvidence = await addIncidentEvidence(evidenceInput);
    assert.ok(successfulEvidence.id > 0);
    const [committed] = await independent.execute<RowDataPacket[]>(
      "SELECT state, evidence_id, storage_key FROM incident_evidence_upload_attempts WHERE actor_user_id = ? AND state = 'committed'",
      [userId],
    );
    assert.equal(committed.length, 1);
    assert.equal(committed[0]?.evidence_id, successfulEvidence.id);
    assert.equal(committed[0]?.storage_key, uploads.at(-1));

    // A revoked session must not reach the synthetic storage service at all.
    const uploadCount = uploads.length;
    await assert.rejects(addIncidentEvidence({ ...evidenceInput, session: conflictingSession }));
    assert.equal(uploads.length, uploadCount);

    // Simulate logout while the external upload is in flight. The file has
    // been uploaded but the DB must NOT publish its evidence metadata.
    revokeDuringNextUpload = async () => { await revokeAllLocalAuthSessions(userId); };
    await assert.rejects(addIncidentEvidence({ ...evidenceInput, fileName: "revoked-in-flight.pdf" }));
    const [cleanupNeeded] = await independent.execute<RowDataPacket[]>(
      "SELECT state, storage_key FROM incident_evidence_upload_attempts WHERE actor_user_id = ? AND state = 'cleanup_required'",
      [userId],
    );
    assert.equal(cleanupNeeded.length, 1);
    assert.ok(uploads.includes(cleanupNeeded[0].storage_key));
    const [evidenceRows] = await independent.execute<RowDataPacket[]>(
      "SELECT id FROM incident_evidence WHERE incident_id = ?", [incidentId],
    );
    assert.equal(evidenceRows.length, 1, "revoked in-flight upload must not publish evidence");
    const pendingReview = await listEvidenceReconciliationCandidates({ page: 1, pageSize: 10 });
    assert.equal(pendingReview.total, 1);
    assert.equal(pendingReview.rows[0]?.reason, "cleanup_pending_review");
    assert.equal(pendingReview.rows[0]?.hasEvidenceReference, false);
    assert.equal(pendingReview.rows[0]?.incidentExists, true);
    assert.ok(!Object.hasOwn(pendingReview.rows[0], "storageKey"),
      "admin reconciliation must never return private blob keys");

    // Permanent deletion must preserve reconciliation for BOTH ledger-backed
    // uploads and an older evidence file with no upload reservation.
    const deletionIncidentId = incidentId;
    const legacyStorageKey = `incident-evidence/${incidentId}/${userId}/pre-ledger-${randomUUID()}.pdf`;
    await independent.execute(
      "INSERT INTO incident_evidence (incident_id, storage_key, file_name, content_type, byte_size, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)",
      [incidentId, legacyStorageKey, "pre-ledger.pdf", "application/pdf", 11, userId],
    );
    const cleanupSession = await verifyLocalSessionToken(
      await createLocalSessionToken(userId, initialHash),
    );
    assert.ok(cleanupSession);
    const deletedWithEvidence = await permanentlyDeleteIncident({
      incidentId, actorUserId: userId,
      reason: "Remove disposable incident and preserve object cleanup queue",
      session: cleanupSession,
    });
    assert.equal(deletedWithEvidence.auditPreserved, true);
    incidentId = null;
    const [reconciliation] = await independent.execute<RowDataPacket[]>(
      "SELECT state, storage_key FROM incident_evidence_upload_attempts WHERE incident_id = ?",
      [deletionIncidentId],
    );
    assert.equal(reconciliation.length, 3);
    assert.ok(reconciliation.every(row => row.state === "cleanup_required"));
    assert.ok(reconciliation.some(row => row.storage_key === legacyStorageKey));
    const [deletedRows] = await independent.execute<RowDataPacket[]>(
      "SELECT id FROM incident_evidence WHERE incident_id = ?", [deletionIncidentId],
    );
    assert.equal(deletedRows.length, 0, "incident deletion cascades DB evidence while retaining cleanup ledger");

    // A stale reservation is reviewable, but a recent upload is not.
    const staleAttemptId = randomUUID();
    const recentAttemptId = randomUUID();
    for (const [attemptId, stale] of [[staleAttemptId, true], [recentAttemptId, false]] as const) {
      const key = `incident-evidence/${deletionIncidentId}/${userId}/${attemptId}-recovery.pdf`;
      await independent.execute(
        "INSERT INTO incident_evidence_upload_attempts (attempt_id, storage_key, incident_id, actor_user_id, team_id, state, updated_at) VALUES (?, ?, ?, ?, ?, 'reserved', ?)",
        [attemptId, key, deletionIncidentId, userId, teamId,
          stale ? new Date(Date.now() - 31 * 60_000) : new Date()],
      );
    }
    const report = await listEvidenceReconciliationCandidates({ page: 1, pageSize: 100 });
    assert.equal(report.total, 4, "three deleted uploads and one stale reservation require review");
    assert.ok(report.rows.every(row => row.incidentExists === false));
    assert.ok(report.rows.every(row => !Object.hasOwn(row, "storageKey")));
    assert.ok(report.rows.some(row =>
      row.attemptId === staleAttemptId && row.reason === "stale_upload_reservation"));
    assert.ok(!report.rows.some(row => row.attemptId === recentAttemptId),
      "recent reservations must not be queued while the upload may still be active");
    const page1 = await listEvidenceReconciliationCandidates({ page: 1, pageSize: 2 });
    const page2 = await listEvidenceReconciliationCandidates({ page: 2, pageSize: 2 });
    assert.equal(page1.total, report.total);
    assert.equal(page1.rows.length, 2);
    assert.equal(page2.rows.length, 2);
    assert.ok(!page1.rows.some(row => page2.rows.some(other => other.attemptId === row.attemptId)),
      "bounded pagination must not return duplicate review records");

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
    console.log("PASS: MySQL 8.4 sessions, incident writes, durable evidence, read-only reconciliation, pagination, recovery after deletion, RBAC and fail-closed.");
  } finally {
    if (lockConnection) {
      await lockConnection.rollback().catch(() => {});
      await lockConnection.end().catch(() => {});
    }
    if (sessionTableTemporarilyRenamed)
      await independent.query("RENAME TABLE local_auth_sessions_smoke_unavailable TO local_auth_sessions").catch(() => {});
    if (userId !== null)
      await independent.execute("DELETE FROM incident_evidence_upload_attempts WHERE actor_user_id = ?", [userId]).catch(() => {});
    if (newIncidentId !== null)
      await independent.execute("DELETE FROM incidents WHERE id = ?", [newIncidentId]).catch(() => {});
    if (incidentId !== null)
      await independent.execute("DELETE FROM incidents WHERE id = ?", [incidentId]).catch(() => {});
    if (teamId !== null)
      await independent.execute("DELETE FROM teams WHERE id = ?", [teamId]).catch(() => {});
    if (unrelatedUserId !== null)
      await independent.execute("DELETE FROM users WHERE id = ?", [unrelatedUserId]).catch(() => {});
    if (userId !== null)
      await independent.execute("DELETE FROM users WHERE id = ?", [userId]).catch(() => {});
    await independent.end();
    globalThis.fetch = previousFetch;
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
