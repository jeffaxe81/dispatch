import { lookup } from "node:dns/promises";

const NEO_URL = "https://gscprj.saas.digitro.cloud/neo/";
const NEO_HOST = "gscprj.saas.digitro.cloud";

const ALLOWED_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

function safeCode(error) {
  const code = error?.cause?.code ?? error?.code;
  return ALLOWED_CODES.has(code) ? code : "<redacted-error>";
}

let dns = { status: "unknown" };
try {
  const result = await lookup(NEO_HOST);
  dns = {
    status: "resolved",
    family: result.family,
  };
} catch (error) {
  dns = {
    status: "failed",
    error: safeCode(error),
  };
}

let http = { status: "not-attempted" };
if (dns.status === "resolved") {
  try {
    const response = await fetch(NEO_URL, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const location = response.headers.get("location");
    let redirectOrigin = null;
    if (location) {
      try {
        redirectOrigin = new URL(location, NEO_URL).origin;
      } catch {
        redirectOrigin = "<redacted-origin>";
      }
    }
    http = {
      status: "responded",
      httpStatus: response.status,
      ...(redirectOrigin ? { redirectOrigin } : {}),
    };
  } catch (error) {
    http = {
      status: "failed",
      error: safeCode(error),
    };
  }
}

const result = { dns, http };
console.log(`neo_auth_preflight=${JSON.stringify(result)}`);

if (dns.status !== "resolved" || http.status === "failed") {
  process.exitCode = 2;
}
