import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HOMOLOGATION_EXECUTION_PHRASE = "AUTHORIZE_INVENTORY_HOMOLOGATION";

function deny(code) {
  throw new Error("INVENTORY_PREFLIGHT_" + code);
}
function required(value, code) {
  if (typeof value !== "string" || !value.trim()) deny(code);
  return value.trim();
}
function hostnameAllowed(value) {
  if (typeof value !== "string") return false;
  const hostname = value.toLowerCase().replace(/\.$/, "");
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname) &&
    hostname.includes(".") &&
    hostname !== "localhost" &&
    !hostname.endsWith(".localhost") &&
    !hostname.endsWith(".local") &&
    isIP(hostname) === 0;
}
function hostFromHttps(value) {
  let u;
  try {
    u = new URL(required(value, "ENDPOINT_MISSING"));
  } catch {
    deny("ENDPOINT_INVALID");
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (u.protocol !== "https:" || u.port || !hostnameAllowed(host) ||
      u.username || u.password || u.search || u.hash ||
      !["", "/"].includes(u.pathname)) deny("ENDPOINT_INVALID");
  return host;
}

/**
 * Pure, offline allowlist/approval gate. No network requests or secret logging.
 * Approval is per manual workflow invocation, not stored as a reusable secret.
 */
export function validateInventoryHomologationConfig(options) {
  if (!options || typeof options !== "object") deny("CONFIG_MISSING");
  if (options.executionApproval !== HOMOLOGATION_EXECUTION_PHRASE) deny("EXPLICIT_APPROVAL_MISSING");

  const allowedRaw = required(options.allowedHosts, "HOST_ALLOWLIST_MISSING");
  const allowed = new Set(allowedRaw.split(",").map(x => x.trim().toLowerCase().replace(/\.$/, "")));
  if (allowed.size < 1 || [...allowed].some(x => !hostnameAllowed(x))) deny("HOST_ALLOWLIST_INVALID");

  const assetHost = hostFromHttps(options.assetMotorBaseUrl);
  const dispatchHost = hostFromHttps(options.dispatchBaseUrl);
  if (!allowed.has(assetHost) || !allowed.has(dispatchHost)) deny("ENDPOINT_NOT_ALLOWLISTED");

  const tenantA = required(options.tenantA, "TENANT_MISSING");
  const tenantB = required(options.tenantB, "TENANT_MISSING");
  if (tenantA === tenantB) deny("TENANTS_NOT_DISTINCT");

  required(options.userId, "USER_MISSING");
  required(options.incidentReference, "INCIDENT_MISSING");
  required(options.authToken, "AUTH_TOKEN_MISSING");

  const timeout = Number(options.timeoutMs === undefined || options.timeoutMs === "" ? 3000 : options.timeoutMs);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) deny("TIMEOUT_INVALID");
  return { approved: true, targetCount: 2 };
}

export function inventoryPreflightFromEnv(env) {
  return validateInventoryHomologationConfig({
    executionApproval: env.HOMOLOGATION_EXECUTION_APPROVAL,
    allowedHosts: env.HOMOLOGATION_ALLOWED_HOSTS,
    assetMotorBaseUrl: env.ASSET_MOTOR_BASE_URL,
    dispatchBaseUrl: env.DISPATCH_BASE_URL,
    tenantA: env.TENANT_A,
    tenantB: env.TENANT_B,
    userId: env.HOMOLOGATION_USER_ID,
    incidentReference: env.HOMOLOGATION_INCIDENT_REFERENCE,
    authToken: env.HOMOLOGATION_AUTH_TOKEN,
    timeoutMs: env.HOMOLOGATION_TIMEOUT_MS,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    inventoryPreflightFromEnv(process.env);
    process.stdout.write("INVENTORY_PREFLIGHT_APPROVED_FOR_HOMOLOGATION_ONLY\n");
  } catch (error) {
    process.stderr.write(error instanceof Error ? error.message + "\n" : "INVENTORY_PREFLIGHT_REJECTED\n");
    process.exitCode = 1;
  }
}
