/**
 * Isolated CI-only storage integration: actual HTTP presign + streamed PUT,
 * real MySQL evidence ledger, local in-memory object store. No real provider.
 * Fail closed unless the exact loopback and disposable DB guardrails match.
 */
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { isReservedIncidentEvidenceKey, storageGetSignedUrl } from "../../server/storage";
import { registerStorageProxy } from "../../server/_core/storageProxy";
import { COOKIE_NAME } from "../../shared/const";

type Mode = "success" | "presign_503" | "put_503_after_store" | "revoke_during_put";
const STORE_ORIGIN = "http://127.0.0.1:8765";
const CI_KEY = "ci-synthetic-storage-only";

function guard(): string {
  let db: URL;
  try { db = new URL(process.env.DATABASE_URL ?? ""); }
  catch { throw new Error("Invalid CI database URL."); }
  if (process.env.CI !== "true" ||
      process.env.SESSION_AUTH_MYSQL_SMOKE !== "1" ||
      process.env.NODE_ENV !== "test" ||
      db.protocol !== "mysql:" ||
      db.hostname !== "127.0.0.1" ||
      db.pathname !== "/dispatch_auth_ci" ||
      process.env.BUILT_IN_FORGE_API_URL !== STORE_ORIGIN ||
      process.env.BUILT_IN_FORGE_API_KEY !== CI_KEY ||
      !process.env.JWT_SECRET ||
      Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32)
    throw new Error("Refusing storage HTTP smoke outside disposable loopback CI.");
  return db.href;
}

async function main() {
  const databaseUrl = guard();
  // Module dependencies read the Forge URL when imported; it is a CI-only
  // localhost endpoint. No environment switches after import are supported.
  const [{ hashLocalPassword, createLocalSessionToken, verifyLocalSessionToken },
    { revokeAllLocalAuthSessions }, { addIncidentEvidence },
    { listEvidenceReconciliationCandidates }] = await Promise.all([
    import("../../server/localAuth"),
    import("../../server/localAuthSessions"),
    import("../../server/db"),
    import("../../server/db"),
  ]);
  const conn = await mysql.createConnection(databaseUrl);
  let serverStarted = false;
  let proxyServer: Server | null = null;
  let proxyOrigin = "";
  let userId: number | null = null;
  let teamId: number | null = null;
  let incidentId: number | null = null;
  let mode: Mode = "success";
  let presignRequests = 0;
  let putRequests = 0;
  let readPresignRequests = 0;
  let readObjectRequests = 0;
  let deleteRequests = 0;
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const signedGetTokens = new Map<string, { key: string; expiresAt: number }>();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? "/", STORE_ORIGIN);
      if (req.method === "GET" && url.pathname === "/v1/storage/presign/put") {
        presignRequests++;
        if (req.headers.authorization !== `Bearer ${CI_KEY}`)
          { res.writeHead(401); res.end(); return; }
        const key = url.searchParams.get("path");
        if (!key || !isReservedIncidentEvidenceKey(key))
          { res.writeHead(400); res.end(); return; }
        if (mode === "presign_503")
          { res.writeHead(503); res.end("synthetic storage presign unavailable"); return; }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ url: STORE_ORIGIN + "/ci-blob/" + encodeURIComponent(key) }));
        return;
      }
      if (req.method === "PUT" && url.pathname.startsWith("/ci-blob/")) {
        putRequests++;
        const key = decodeURIComponent(url.pathname.slice("/ci-blob/".length));
        if (!isReservedIncidentEvidenceKey(key) ||
            req.headers["content-type"] !== "application/pdf") {
          res.writeHead(400); res.end(); return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          const part = Buffer.from(chunk);
          size += part.length;
          if (size > 1024 * 1024) throw new Error("Synthetic object over 1 MiB.");
          chunks.push(part);
        }
        objects.set(key, { bytes: Buffer.concat(chunks), contentType: "application/pdf" });
        if (mode === "revoke_during_put") {
          if (!userId) throw new Error("Missing disposable user.");
          await revokeAllLocalAuthSessions(userId);
        }
        if (mode === "put_503_after_store")
          { res.writeHead(503); res.end("synthetic provider failure after object persistence"); return; }
        res.writeHead(200); res.end();
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/storage/presign/get") {
        readPresignRequests++;
        if (req.headers.authorization !== `Bearer ${CI_KEY}`) {
          res.writeHead(401); res.end(); return;
        }
        const key = url.searchParams.get("path");
        if (!key || !isReservedIncidentEvidenceKey(key)) {
          res.writeHead(400); res.end(); return;
        }
        // The presign endpoint may return a URL even when the object is absent.
        // Only the subsequent GET indicates whether the bytes exist.
        const token = randomUUID();
        signedGetTokens.set(token, { key, expiresAt: Date.now() + 30_000 });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ url: STORE_ORIGIN + "/ci-download/" + token }));
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/ci-download/")) {
        readObjectRequests++;
        const token = url.pathname.slice("/ci-download/".length);
        const signed = signedGetTokens.get(token);
        if (!signed || Date.now() > signed.expiresAt) {
          res.writeHead(403); res.end(); return;
        }
        const object = objects.get(signed.key);
        if (!object) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, {
          "content-type": object.contentType,
          "content-length": String(object.bytes.length),
          "cache-control": "no-store",
        });
        res.end(object.bytes);
        return;
      }
      if (req.method === "DELETE") {
        deleteRequests++;
        res.writeHead(405); res.end(); return;
      }
      // Unknown methods and paths are never permitted.
      res.writeHead(405); res.end();
    } catch {
      res.writeHead(500); res.end("synthetic provider error");
    }
  });

  try {
    const [dbName] = await conn.query<RowDataPacket[]>("SELECT DATABASE() AS current_database");
    assert.equal(dbName[0]?.current_database, "dispatch_auth_ci");
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(8765, "127.0.0.1", resolve);
    });
    serverStarted = true;

    const username = "store_ci_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const passwordHash = await hashLocalPassword("local-http-test-" + randomUUID());
    const [user] = await conn.execute<ResultSetHeader>(
      "INSERT INTO users (openId, username, password_hash, loginMethod) VALUES (?, ?, ?, 'local_password')",
      ["local:" + username, username, passwordHash],
    );
    userId = user.insertId;
    const [team] = await conn.execute<ResultSetHeader>(
      "INSERT INTO teams (code, name, agency) VALUES (?, 'Disposable storage team', 'CI')",
      ["ST" + randomUUID().replaceAll("-", "").slice(0, 20)],
    );
    teamId = team.insertId;
    await conn.execute(
      "UPDATE users SET operational_role = 'agente', teamId = ? WHERE id = ?",
      [teamId, userId],
    );
    const [incident] = await conn.execute<ResultSetHeader>(
      "INSERT INTO incidents (code, incident_status, incident_priority, category, incident_origin, description, address, latitude, longitude, assigned_team_id, created_by_user_id) VALUES (?, 'aceita', 'media', 'Evidence CI', 'central', 'HTTP provider contract smoke', 'Local disposable CI address', '-27.0', '-48.0', ?, ?)",
      ["ST" + randomUUID().replaceAll("-", "").slice(0, 20), teamId, userId],
    );
    incidentId = incident.insertId;
    const token = await createLocalSessionToken(userId, passwordHash);
    const identity = await verifyLocalSessionToken(token);
    assert.ok(identity);
    const app = express();
    registerStorageProxy(app);
    proxyServer = await new Promise<Server>((resolve, reject) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
      listener.once("error", reject);
    });
    const proxyAddress = proxyServer.address();
    if (!proxyAddress || typeof proxyAddress === "string")
      throw new Error("Invalid isolated storage proxy address.");
    proxyOrigin = `http://127.0.0.1:${proxyAddress.port}`;
    const sessionCookie = `${COOKIE_NAME}=${token}`;
    const proxyPath = (key: string) =>
      proxyOrigin + "/manus-storage/" + key;

    const input = {
      incidentId, actorUserId: userId, teamId,
      contentType: "application/pdf",
      dataBase64: Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64"),
      session: identity,
    };
    async function rows() {
      const [result] = await conn.execute<RowDataPacket[]>(
        "SELECT attempt_id, state, storage_key, evidence_id FROM incident_evidence_upload_attempts WHERE actor_user_id = ? ORDER BY created_at, attempt_id",
        [userId],
      );
      return result;
    }
    async function checkNoExtraEvidence(expected: number) {
      const [result] = await conn.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM incident_evidence WHERE incident_id = ?",
        [incidentId],
      );
      assert.equal(Number(result[0]?.total), expected);
    }

    const successful = await addIncidentEvidence({
      ...input, fileName: "http-success.pdf",
    });
    assert.ok(successful.id > 0);
    assert.equal(presignRequests, 1);
    assert.equal(putRequests, 1);
    const afterSuccess = await rows();
    assert.equal(afterSuccess.length, 1);
    assert.equal(afterSuccess[0]?.state, "committed");
    assert.equal(afterSuccess[0]?.evidence_id, successful.id);
    const saved = objects.get(String(afterSuccess[0]?.storage_key));
    assert.ok(saved);
    assert.equal(saved.contentType, "application/pdf");
    assert.deepEqual(saved.bytes, Buffer.from(input.dataBase64, "base64"));
    // Real HTTP GET round-trip via the existing production signing helper.
    // The signed URL stays inside this process, never in a tRPC response.
    const signedRead = await storageGetSignedUrl(String(afterSuccess[0].storage_key));
    assert.equal(new URL(signedRead).origin, STORE_ORIGIN);
    const readResponse = await fetch(signedRead, { redirect: "manual" });
    assert.equal(readResponse.status, 200);
    assert.equal(readResponse.headers.get("content-type"), "application/pdf");
    assert.deepEqual(Buffer.from(await readResponse.arrayBuffer()), saved.bytes);

    // The actual application's private redirect proxy must authorize a
    // committed reference BEFORE signing/redirecting to the object.
    const referenceKey = String(afterSuccess[0].storage_key);
    const unsignedBeforeProxy = readPresignRequests;
    const anonymousProxy = await fetch(proxyPath(referenceKey), { redirect: "manual" });
    assert.equal(anonymousProxy.status, 401);
    assert.equal(readPresignRequests, unsignedBeforeProxy);
    const authorizedProxy = await fetch(proxyPath(referenceKey), {
      headers: { cookie: sessionCookie },
      redirect: "manual",
    });
    assert.equal(authorizedProxy.status, 307);
    assert.equal(authorizedProxy.headers.get("cache-control"), "no-store");
    const redirect = authorizedProxy.headers.get("location");
    assert.ok(redirect);
    assert.equal(new URL(redirect).origin, STORE_ORIGIN);
    const proxiedObject = await fetch(redirect, { redirect: "manual" });
    assert.equal(proxiedObject.status, 200);
    assert.deepEqual(Buffer.from(await proxiedObject.arrayBuffer()), saved.bytes);

    const deniedPresign = await fetch(
      STORE_ORIGIN + "/v1/storage/presign/get?path=" +
      encodeURIComponent(String(afterSuccess[0].storage_key)),
    );
    assert.equal(deniedPresign.status, 401);
    assert.equal((await fetch(STORE_ORIGIN + "/ci-download/" + randomUUID())).status, 403,
      "unsigned direct reads must not expose a stored object");
    await checkNoExtraEvidence(1);

    mode = "presign_503";
    await assert.rejects(
      addIncidentEvidence({ ...input, fileName: "http-presign-503.pdf" }),
      /Storage presign failed \(503\)/,
    );
    const afterPresign = await rows();
    assert.equal(afterPresign.length, 2);
    const presignFailure = afterPresign.find(row =>
      String(row.storage_key).endsWith("-http-presign-503.pdf"));
    assert.equal(presignFailure?.state, "cleanup_required");
    assert.equal(objects.has(String(presignFailure?.storage_key)), false);
    const signedMissing = await storageGetSignedUrl(String(presignFailure!.storage_key));
    assert.equal((await fetch(signedMissing)).status, 404,
      "presigned URL is not proof that remote object exists");
    assert.equal(putRequests, 1);
    const signBeforeOrphan = readPresignRequests;
    const orphanProxy = await fetch(proxyPath(String(presignFailure!.storage_key)), {
      headers: { cookie: sessionCookie }, redirect: "manual",
    });
    assert.equal(orphanProxy.status, 404);
    assert.equal(readPresignRequests, signBeforeOrphan,
      "uncommitted reservations must never yield signed redirect URLs");
    await checkNoExtraEvidence(1);

    mode = "put_503_after_store";
    await assert.rejects(
      addIncidentEvidence({ ...input, fileName: "http-put-503.pdf" }),
      /Storage upload failed \(503\)/,
    );
    const afterPutFailure = await rows();
    assert.equal(afterPutFailure.length, 3);
    const persistedOrphan = afterPutFailure.find(row =>
      String(row.storage_key).endsWith("-http-put-503.pdf"));
    assert.equal(persistedOrphan?.state, "cleanup_required");
    assert.ok(objects.has(String(persistedOrphan?.storage_key)),
      "HTTP provider can persist bytes yet report failure; ledger must retain orphan");
    const signedOrphan = await storageGetSignedUrl(String(persistedOrphan!.storage_key));
    const orphanGet = await fetch(signedOrphan);
    assert.equal(orphanGet.status, 200, "a failed PUT can leave retrievable bytes");
    assert.deepEqual(Buffer.from(await orphanGet.arrayBuffer()),
      Buffer.from(input.dataBase64, "base64"));
    const afterFailedPutSignCount = readPresignRequests;
    const failedPutProxy = await fetch(proxyPath(String(persistedOrphan!.storage_key)), {
      headers: { cookie: sessionCookie }, redirect: "manual",
    });
    assert.equal(failedPutProxy.status, 404);
    assert.equal(readPresignRequests, afterFailedPutSignCount,
      "a remotely stored orphan must not bypass the DB evidence reference");
    await checkNoExtraEvidence(1);

    mode = "revoke_during_put";
    await assert.rejects(
      addIncidentEvidence({ ...input, fileName: "http-revoked.pdf" }),
    );
    const afterRevoke = await rows();
    assert.equal(afterRevoke.length, 4);
    const revokedUpload = afterRevoke.find(row =>
      String(row.storage_key).endsWith("-http-revoked.pdf"));
    assert.equal(revokedUpload?.state, "cleanup_required");
    assert.ok(objects.has(String(revokedUpload?.storage_key)));
    await checkNoExtraEvidence(1);

    const presignBeforeRejected = presignRequests;
    await assert.rejects(
      addIncidentEvidence({ ...input, fileName: "http-replay.pdf" }),
    );
    assert.equal(presignRequests, presignBeforeRejected,
      "revoked JWT must be rejected before contacting provider");
    assert.equal((await rows()).length, 4, "revoked request cannot create a new reservation");
    const signBeforeRevoked = readPresignRequests;
    const revokedProxy = await fetch(proxyPath(referenceKey), {
      headers: { cookie: sessionCookie }, redirect: "manual",
    });
    assert.equal(revokedProxy.status, 401);
    assert.equal(readPresignRequests, signBeforeRevoked,
      "revoked JWT must not cause the storage proxy to sign a download URL");

    const report = await listEvidenceReconciliationCandidates({ page: 1, pageSize: 100 });
    const own = report.rows.filter(row => row.actorUserId === userId);
    assert.equal(own.length, 3);
    assert.ok(own.every(row => row.reason === "cleanup_pending_review"));
    assert.ok(own.every(row => !Object.hasOwn(row, "storageKey")));
    const [events] = await conn.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM incident_events WHERE incident_id = ? AND event_type = 'evidence_added'",
      [incidentId],
    );
    assert.equal(Number(events[0]?.total), 1,
      "only successful HTTP PUT may publish the evidence event");
    assert.equal(objects.size, 3,
      "a failed presign must create no object; ambiguous and revoked PUTs remain local");
    const readOnlySnapshot = objects.size;
    const forbiddenDelete = await fetch(
      STORE_ORIGIN + "/ci-blob/" + encodeURIComponent(String(persistedOrphan!.storage_key)),
      { method: "DELETE" },
    );
    assert.equal(forbiddenDelete.status, 405);
    assert.equal(deleteRequests, 1);
    assert.equal(objects.size, readOnlySnapshot, "deletion must not remove any CI objects");
    assert.ok(readPresignRequests >= 3);
    assert.ok(readObjectRequests >= 4);
    console.log("PASS: loopback HTTP presign/PUT/GET, denied anonymous reads, missing objects, 503 before/after PUT, concurrent revocation, durable cleanup and no deletion.");
  } finally {
    if (proxyServer) await new Promise<void>(resolve => proxyServer!.close(() => resolve()));
    if (serverStarted) await new Promise<void>(resolve => server.close(() => resolve()));
    if (userId) await conn.execute("DELETE FROM incident_evidence_upload_attempts WHERE actor_user_id = ?", [userId]).catch(() => {});
    if (incidentId) await conn.execute("DELETE FROM incidents WHERE id = ?", [incidentId]).catch(() => {});
    if (teamId) await conn.execute("DELETE FROM teams WHERE id = ?", [teamId]).catch(() => {});
    if (userId) await conn.execute("DELETE FROM local_auth_sessions WHERE user_id = ?", [userId]).catch(() => {});
    if (userId) await conn.execute("DELETE FROM users WHERE id = ?", [userId]).catch(() => {});
    await conn.end();
    objects.clear();
    signedGetTokens.clear();
  }
}

void main().then(
  () => process.stdout.write("Local storage HTTP + MySQL smoke completed.\n",
    () => process.exit(0)),
  error => {
    // Never print JWT, cookie, DATABASE_URL, private key or object bytes.
    const message = error instanceof Error ? error.message : "unknown";
    process.stderr.write("Local storage CI validation failed: " + message + "\n",
      () => process.exit(1));
  },
);
