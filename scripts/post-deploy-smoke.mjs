const DEFAULT_TIMEOUT_MS = 5_000;

function configurationError(message) {
  return new Error(`configuration: ${message}`);
}

function readConfig(env = process.env) {
  const rawBaseUrl = env.SMOKE_BASE_URL ?? "";
  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw configurationError("SMOKE_BASE_URL must be a valid URL");
  }
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw configurationError("SMOKE_BASE_URL must use http or https");
  }

  const timeoutMs = Number(env.SMOKE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30_000
  ) {
    throw configurationError("SMOKE_TIMEOUT_MS must be 100..30000");
  }

  return { baseUrl, timeoutMs };
}

function fail(check, message) {
  throw new Error(`${check}: ${message}`);
}

async function fetchWithTimeout(url, timeoutMs, check) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    fail(check, "request failed or timed out");
  }
}

function hasExactKeys(value, expectedKeys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expectedKeys].sort().join(",")
  );
}

async function checkJson(baseUrl, path, timeoutMs, name, validate) {
  const response = await fetchWithTimeout(
    new URL(path, baseUrl),
    timeoutMs,
    name,
  );
  if (response.status !== 200) fail(name, "expected HTTP 200");

  let body;
  try {
    body = await response.json();
  } catch {
    fail(name, "expected JSON response");
  }
  if (!validate(body)) fail(name, "unexpected response contract");
  console.log(`[smoke] PASS ${name}`);
}

async function checkHomepage(baseUrl, timeoutMs) {
  const response = await fetchWithTimeout(baseUrl, timeoutMs, "homepage");
  if (response.status !== 200) fail("homepage", "expected HTTP 200");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("text/html")) {
    fail("homepage", "expected text/html");
  }
  await response.body?.cancel().catch(() => undefined);
  console.log("[smoke] PASS homepage");
}

async function main() {
  const { baseUrl, timeoutMs } = readConfig();
  await checkJson(baseUrl, "/health/live", timeoutMs, "liveness", body =>
    hasExactKeys(body, ["status"]) && body.status === "alive",
  );
  await checkJson(baseUrl, "/health/ready", timeoutMs, "readiness", body =>
    hasExactKeys(body, ["status", "checks"]) &&
    body.status === "ready" &&
    hasExactKeys(body.checks, ["database", "storage"]) &&
    body.checks.database === "ok" &&
    body.checks.storage === "ok",
  );
  await checkHomepage(baseUrl, timeoutMs);
  console.log("[smoke] PASS all checks");
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "unexpected error";
  console.error(`[smoke] FAIL ${message}`);
  process.exitCode = 1;
});
