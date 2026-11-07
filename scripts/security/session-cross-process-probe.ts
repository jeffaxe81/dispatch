/**
 * Disposable CI-only subprocess: independently imports the real auth and
 * evidence code, sharing only MySQL with the parent. No real HTTP server.
 * JWT is accepted exclusively over stdin (never argv, logs or a URL).
 */
import type { Request } from "express";
import { COOKIE_NAME } from "../../shared/const";
import { authenticateLocalRequest, verifyLocalSessionToken } from "../../server/localAuth";
import { addIncidentEvidence } from "../../server/db";

type RequestPayload =
  | { kind: "auth"; token: string }
  | { kind: "upload-crash"; token: string; incidentId: number; actorUserId: number; teamId: number };

function assertIsolatedEnvironment() {
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? ""); }
  catch { throw new Error("Unsafe subprocess database target."); }
  if (process.env.SESSION_AUTH_MYSQL_SMOKE !== "1" ||
    process.env.SESSION_AUTH_SUBPROCESS_PROBE !== "1" ||
    process.env.NODE_ENV !== "test" ||
    url.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/dispatch_auth_ci" ||
    !process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32 ||
    process.env.BUILT_IN_FORGE_API_URL !== "http://127.0.0.1:8765" ||
    process.env.BUILT_IN_FORGE_API_KEY !== "ci-synthetic-storage-only"
  ) throw new Error("Refusing cross-process smoke outside isolated CI.");
}

async function readRequest(): Promise<RequestPayload> {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += String(chunk);
    if (raw.length > 16384) throw new Error("CI probe request too large.");
  }
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("kind" in value) ||
      !("token" in value) || typeof value.token !== "string" ||
      value.token.length > 8192)
    throw new Error("Malformed CI probe request.");
  if (value.kind === "auth") return { kind: "auth", token: value.token };
  if (value.kind === "upload-crash" &&
      "incidentId" in value && "actorUserId" in value && "teamId" in value &&
      [value.incidentId, value.actorUserId, value.teamId].every(
        n => Number.isSafeInteger(n) && (n as number) > 0,
      ))
    return {
      kind: "upload-crash", token: value.token,
      incidentId: value.incidentId as number,
      actorUserId: value.actorUserId as number,
      teamId: value.teamId as number,
    };
  throw new Error("Unsupported CI probe.");
}

async function main() {
  assertIsolatedEnvironment();
  const input = await readRequest();
  const request = { headers: { cookie: `${COOKIE_NAME}=${input.token}` } } as Request;
  if (input.kind === "auth") {
    const actor = await authenticateLocalRequest(request);
    // Only a boolean and optional numeric ID ever leave the subprocess.
    process.stdout.write(JSON.stringify({
      authenticated: Boolean(actor), userId: actor?.id ?? null,
    }) + "\n", () => process.exit(0));
    return;
  }

  const identity = await verifyLocalSessionToken(input.token);
  if (!identity || identity.userId !== input.actorUserId)
    throw new Error("Invalid CI upload identity.");

  // Simulates an external PUT that finished but the Node process died BEFORE
  // the DB transaction could publish the evidence metadata. The remote object
  // is synthetic; this does NOT test a real provider.
  globalThis.fetch = async (resource, options) => {
    const target = new URL(typeof resource === "string" ? resource :
      resource instanceof URL ? resource.href : resource.url);
    if (target.origin !== "http://127.0.0.1:8765")
      throw new Error("Non-synthetic network target blocked.");
    if (target.pathname === "/v1/storage/presign/put") {
      const key = target.searchParams.get("path");
      if (!key?.startsWith("incident-evidence/") || !key.endsWith("-crash-probe.pdf"))
        throw new Error("Unexpected synthetic storage key.");
      return new Response(JSON.stringify({
        url: "http://127.0.0.1:8765/synthetic-put/" + encodeURIComponent(key),
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (target.pathname.startsWith("/synthetic-put/") && options?.method === "PUT") {
      process.stdout.write("SIMULATED_PUT_ACK\n", () => process.exit(77));
      // The process exits here; second evidence transaction MUST NOT run.
      return new Promise<Response>(() => {});
    }
    throw new Error("Unexpected synthetic storage operation.");
  };
  await addIncidentEvidence({
    incidentId: input.incidentId,
    actorUserId: input.actorUserId,
    teamId: input.teamId,
    fileName: "crash-probe.pdf",
    contentType: "application/pdf",
    dataBase64: Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64"),
    session: identity,
  });
  throw new Error("Crash simulation unexpectedly committed evidence.");
}

void main().catch(error => {
  const message = error instanceof Error ? error.message : "unknown";
  // Do not include request body or credentials in error messages.
  process.stderr.write("Cross-process CI probe failed: " + message + "\n",
    () => process.exit(1));
});
