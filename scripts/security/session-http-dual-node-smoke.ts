/**
 * Two real Express/tRPC HTTP adapters in separate Node processes, fronted by
 * a tiny loopback-only round-robin reverse proxy. Uses disposable MySQL 8.4.
 * No real deployment, remote network, TLS, storage, or production credentials.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { hashLocalPassword } from "../../server/localAuth";
import { COOKIE_NAME } from "../../shared/const";

type NodeHandle = { process: ChildProcessWithoutNullStreams; port: number };
const HTTP_NODE_SCRIPT = "scripts/security/session-http-node.ts";

function guardedUrl() {
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? ""); }
  catch { throw new Error("Invalid isolated CI database URL."); }
  if (process.env.SESSION_AUTH_MYSQL_SMOKE !== "1" ||
      process.env.NODE_ENV !== "test" ||
      url.protocol !== "mysql:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/dispatch_auth_ci" ||
      !process.env.JWT_SECRET ||
      Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32)
    throw new Error("Refusing HTTP dual-node smoke outside local MySQL CI.");
  return url.href;
}

async function launchNode(): Promise<NodeHandle> {
  const child = spawn(process.execPath, ["--import", "tsx", HTTP_NODE_SCRIPT], {
    cwd: process.cwd(),
    env: { ...process.env, SESSION_AUTH_HTTP_NODE: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let output = "";
    let diagnostics = "";
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      fail("HTTP node startup timed out.");
    }, 30_000);
    function fail(message: string) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(message + (diagnostics ? " " + diagnostics.slice(-500) : "")));
    }
    child.stdout.on("data", chunk => {
      if (settled) return;
      output += String(chunk);
      if (output.length > 10_000) {
        child.kill("SIGKILL");
        fail("Unexpected HTTP node output.");
        return;
      }
      const newline = output.indexOf("\n");
      if (newline < 0) return;
      let value: unknown;
      try { value = JSON.parse(output.slice(0, newline)); }
      catch { fail("HTTP node did not return readiness JSON."); return; }
      if (!value || typeof value !== "object" ||
          !("ready" in value) || value.ready !== true ||
          !("port" in value) || typeof value.port !== "number" ||
          !Number.isSafeInteger(value.port) || value.port < 1 || value.port > 65535) {
        fail("HTTP node returned invalid readiness.");
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ process: child, port: value.port });
    });
    child.stderr.on("data", chunk => {
      diagnostics += String(chunk);
      if (diagnostics.length > 8192) diagnostics = diagnostics.slice(-8192);
    });
    child.on("error", () => fail("HTTP node startup error."));
    child.on("exit", () => fail("HTTP node exited before readiness."));
  });
}

async function stopNode(node: NodeHandle) {
  if (node.process.exitCode !== null) return;
  node.process.kill("SIGTERM");
  await new Promise<void>(resolve => {
    if (node.process.exitCode !== null) { resolve(); return; }
    const timeout = setTimeout(() => { node.process.kill("SIGKILL"); resolve(); }, 7_000);
    node.process.once("exit", () => { clearTimeout(timeout); resolve(); });
  });
}

function portOf(server: Server): number {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Invalid loopback address.");
  return address.port;
}

async function startProxy(nodes: NodeHandle[]) {
  let sequence = 0;
  const server = createServer(async (request, response) => {
    const current = sequence++ % 2;
    const node = nodes[current];
    try {
      const destination = new URL(request.url ?? "/", `http://127.0.0.1:${node.port}`);
      if (destination.hostname !== "127.0.0.1" || !destination.pathname.startsWith("/api/trpc/")) {
        response.writeHead(404); response.end(); return;
      }
      const bytes: Buffer[] = [];
      for await (const chunk of request) {
        bytes.push(Buffer.from(chunk));
        if (bytes.reduce((sum, b) => sum + b.length, 0) > 256_000)
          throw new Error("Request exceeds isolated proxy body limit.");
      }
      const method = request.method ?? "GET";
      const upstream = await fetch(destination, {
        method,
        headers: {
          ...(request.headers.cookie ? { cookie: String(request.headers.cookie) } : {}),
          ...(request.headers["content-type"] ? { "content-type": String(request.headers["content-type"]) } : {}),
        },
        ...(method !== "GET" && method !== "HEAD" ? { body: Buffer.concat(bytes) } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      const payload = Buffer.from(await upstream.arrayBuffer());
      response.statusCode = upstream.status;
      response.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
      response.setHeader("x-ci-node", String(current));
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length) response.setHeader("set-cookie", cookies);
      response.end(payload);
    } catch {
      response.writeHead(502);
      response.end(JSON.stringify({ error: "Isolated HTTP backend unavailable" }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

async function requestRpc(base: string, procedure: string, input: unknown, cookie?: string, mutation = false) {
  const encoded = input === undefined ? "" : "?input=" + encodeURIComponent(JSON.stringify({ json: input }));
  const url = base + "/api/trpc/" + procedure + (mutation ? "" : encoded);
  const response = await fetch(url, {
    method: mutation ? "POST" : "GET",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(mutation ? { "content-type": "application/json" } : {}),
    },
    ...(mutation ? { body: JSON.stringify({ json: input }) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch { throw new Error(`Non-JSON tRPC response (${response.status}).`); }
  const result = payload && typeof payload === "object" && "result" in payload ? payload.result : null;
  const data = result && typeof result === "object" && "data" in result ? result.data : null;
  const content = data && typeof data === "object" && "json" in data ? data.json : data;
  return { status: response.status, node: response.headers.get("x-ci-node"),
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null,
    data: content, raw };
}

async function main() {
  const database = guardedUrl();
  const db = await mysql.createConnection(database);
  const nodes: NodeHandle[] = [];
  let proxy: Server | undefined;
  let userId: number | undefined;
  let attemptId: string | undefined;
  try {
    const [rows] = await db.query<RowDataPacket[]>("SELECT DATABASE() AS db_name");
    assert.equal(rows[0]?.db_name, "dispatch_auth_ci");
    const username = "http_smoke_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const password = "http-ci-" + randomUUID();
    const passwordHash = await hashLocalPassword(password);
    const [user] = await db.execute<ResultSetHeader>(
      "INSERT INTO users (openId, username, password_hash, loginMethod, role, operational_role, active) VALUES (?, ?, ?, 'local_password', 'admin', 'administrador', 1)",
      ["local:" + username, username, passwordHash],
    );
    userId = user.insertId;
    attemptId = randomUUID();
    const privateKey = `incident-evidence/2147483000/${userId}/${attemptId}-private.pdf`;
    await db.execute(
      "INSERT INTO incident_evidence_upload_attempts (attempt_id, storage_key, incident_id, actor_user_id, team_id, state) VALUES (?, ?, 2147483000, ?, 0, 'cleanup_required')",
      [attemptId, privateKey, userId],
    );

    nodes.push(await launchNode());
    nodes.push(await launchNode());
    proxy = await startProxy(nodes);
    const base = `http://127.0.0.1:${portOf(proxy)}`;

    const anonymous = await requestRpc(base, "auth.me", undefined);
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.data, null);
    const denied = await requestRpc(base, "settings.evidenceRecovery",
      { page: 1, pageSize: 5, state: "all" });
    assert.equal(denied.status, 401);

    const login = await requestRpc(base, "auth.login", { username, password }, undefined, true);
    assert.equal(login.status, 200);
    assert.ok(login.cookie?.startsWith(COOKIE_NAME + "="), "real tRPC login must set HTTP-only cookie");
    assert.ok(login.raw && !login.raw.includes(passwordHash), "password hashes cannot be exposed");
    const cookie = login.cookie!;
    const authenticated = await requestRpc(base, "auth.me", undefined, cookie);
    assert.equal(authenticated.status, 200);
    assert.equal((authenticated.data as { id?: number })?.id, userId);
    assert.notEqual(login.node, authenticated.node, "round-robin proxy must route cookie to a different HTTP node");

    const review = await requestRpc(base, "settings.evidenceRecovery",
      { page: 1, pageSize: 5, state: "cleanup_required" }, cookie);
    assert.equal(review.status, 200);
    const reviewData = review.data as { total: number; rows: Array<{ attemptId: string }> };
    assert.ok(reviewData?.total >= 1);
    assert.ok(reviewData.rows.some(row => row.attemptId === attemptId));
    assert.ok(!review.raw.includes(privateKey), "private storage key must stay server-side");

    const logout = await requestRpc(base, "auth.logout", {}, cookie, true);
    assert.equal(logout.status, 200);
    const revokedMe = await requestRpc(base, "auth.me", undefined, cookie);
    assert.equal(revokedMe.status, 200);
    assert.equal(revokedMe.data, null);
    assert.notEqual(logout.node, revokedMe.node, "logout must revoke the token across backend nodes");
    const revokedReview = await requestRpc(base, "settings.evidenceRecovery",
      { page: 1, pageSize: 5, state: "all" }, cookie);
    assert.equal(revokedReview.status, 401);

    const relogin = await requestRpc(base, "auth.login", { username, password }, undefined, true);
    assert.equal(relogin.status, 200);
    const secondCookie = relogin.cookie;
    assert.ok(secondCookie);
    // Restart one independent process; its replacement has a NEW in-memory
    // state and must authenticate the existing cookie through shared MySQL.
    await stopNode(nodes[0]);
    nodes[0] = await launchNode();
    const afterRestart1 = await requestRpc(base, "auth.me", undefined, secondCookie!);
    const afterRestart2 = await requestRpc(base, "auth.me", undefined, secondCookie!);
    assert.equal(afterRestart1.status, 200);
    assert.equal(afterRestart2.status, 200);
    assert.equal((afterRestart1.data as { id?: number })?.id, userId);
    assert.equal((afterRestart2.data as { id?: number })?.id, userId);
    assert.notEqual(afterRestart1.node, afterRestart2.node);

    const [registrations] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM local_auth_sessions WHERE user_id = ? AND revoked_at IS NULL",
      [userId],
    );
    assert.equal(Number(registrations[0]?.total), 1, "only the re-login should remain unrevoked");

    console.log("PASS: two isolated Express/tRPC HTTP backends behind round-robin loopback proxy; real login, administrative read, logout, revocation and restart.");
  } finally {
    if (proxy) await new Promise<void>(resolve => proxy!.close(() => resolve()));
    await Promise.allSettled(nodes.map(stopNode));
    if (attemptId) await db.execute("DELETE FROM incident_evidence_upload_attempts WHERE attempt_id = ?", [attemptId]).catch(() => {});
    if (userId) await db.execute("DELETE FROM local_auth_sessions WHERE user_id = ?", [userId]).catch(() => {});
    if (userId) await db.execute("DELETE FROM users WHERE id = ?", [userId]).catch(() => {});
    await db.end();
  }
}

void main().then(
  () => process.stdout.write("Dual-node HTTP MySQL smoke finished.\n", () => process.exit(0)),
  error => {
    // Deliberately never print cookies, JWT, DB URL or submitted credentials.
    const message = error instanceof Error ? error.message : "unknown error";
    process.stderr.write("Isolated dual-node HTTP smoke failed: " + message + "\n",
      () => process.exit(1));
  },
);
