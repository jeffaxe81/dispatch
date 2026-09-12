import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function newCorrelationId() {
  return `inventory-hml-${randomUUID()}`;
}

async function requestJson({ baseUrl, pathname, method = "GET", tenantId, userId, correlationId, timeoutMs, authToken, body }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${pathname}`, {
      method,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        "x-tenant-id": tenantId,
        "x-user-id": userId,
        "x-correlation-id": correlationId,
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      networkError: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function pushCheck(checks, name, passed, details = {}) {
  checks.push({ name, status: passed ? "PASS" : "FAIL", ...details });
}

export async function runInventoryExternalHomologation(options) {
  const {
    assetMotorBaseUrl,
    dispatchBaseUrl,
    tenantA,
    tenantB,
    userId,
    incidentReference,
    timeoutMs = 3000,
    authToken,
  } = options;

  const checks = [];
  const correlationIds = [];
  const correlation = () => {
    const id = newCorrelationId();
    correlationIds.push(id);
    return id;
  };

  const search = await requestJson({
    baseUrl: assetMotorBaseUrl,
    pathname: "/api/v1/assets?query=PST&page=1&pageSize=10",
    tenantId: tenantA,
    userId,
    correlationId: correlation(),
    timeoutMs,
    authToken,
  });

  const assetId = search.payload?.items?.[0]?.id;
  pushCheck(checks, "asset-search", search.ok && Boolean(assetId), { httpStatus: search.status });

  if (!search.ok || !assetId) {
    pushCheck(checks, "motor-unavailable", search.status === 0, { error: search.networkError || null });
    return {
      status: "FAIL",
      generatedAt: new Date().toISOString(),
      checks,
      correlationIds,
    };
  }

  const detail = await requestJson({
    baseUrl: assetMotorBaseUrl,
    pathname: `/api/v1/assets/${encodeURIComponent(assetId)}`,
    tenantId: tenantA,
    userId,
    correlationId: correlation(),
    timeoutMs,
    authToken,
  });
  pushCheck(checks, "asset-detail", detail.ok && detail.payload?.id === assetId, { httpStatus: detail.status });

  const location = await requestJson({
    baseUrl: assetMotorBaseUrl,
    pathname: `/api/v1/assets/${encodeURIComponent(assetId)}/location`,
    tenantId: tenantA,
    userId,
    correlationId: correlation(),
    timeoutMs,
    authToken,
  });
  pushCheck(
    checks,
    "asset-location",
    location.ok && Number.isFinite(location.payload?.latitude) && Number.isFinite(location.payload?.longitude),
    { httpStatus: location.status },
  );

  const link = await requestJson({
    baseUrl: assetMotorBaseUrl,
    pathname: `/api/v1/assets/${encodeURIComponent(assetId)}/dispatch-references`,
    method: "POST",
    tenantId: tenantA,
    userId,
    correlationId: correlation(),
    timeoutMs,
    authToken,
    body: {
      referenceType: "occurrence",
      externalReference: incidentReference,
      source: "dispatch-homologation",
      idempotencyKey: `${tenantA}:occurrence:${incidentReference}`,
    },
  });
  pushCheck(checks, "dispatch-reference-link", link.ok, { httpStatus: link.status });

  const crossTenant = await requestJson({
    baseUrl: assetMotorBaseUrl,
    pathname: `/api/v1/assets/${encodeURIComponent(assetId)}`,
    tenantId: tenantB,
    userId,
    correlationId: correlation(),
    timeoutMs,
    authToken,
  });
  pushCheck(checks, "tenant-isolation", crossTenant.status === 403 || crossTenant.status === 404, { httpStatus: crossTenant.status });

  const eventId = `homologation:${tenantA}:${assetId}:${Date.now()}`;
  const baseEvent = {
    eventId,
    eventType: "asset.updated",
    eventVersion: "1",
    tenantId: tenantA,
    assetId,
    assetVersion: 1,
    correlationId: correlation(),
    occurredAt: new Date().toISOString(),
    payload: { code: detail.payload?.code || null, status: detail.payload?.status || null },
  };
  correlationIds.push(baseEvent.correlationId);

  const eventProcessed = await requestJson({
    baseUrl: dispatchBaseUrl,
    pathname: "/homologation/events",
    method: "POST",
    tenantId: tenantA,
    userId,
    correlationId: baseEvent.correlationId,
    timeoutMs,
    authToken,
    body: baseEvent,
  });
  pushCheck(checks, "event-processed", eventProcessed.ok && eventProcessed.payload?.status === "processed", { httpStatus: eventProcessed.status });

  const replayCorrelation = correlation();
  const eventReplay = await requestJson({
    baseUrl: dispatchBaseUrl,
    pathname: "/homologation/events",
    method: "POST",
    tenantId: tenantA,
    userId,
    correlationId: replayCorrelation,
    timeoutMs,
    authToken,
    body: { ...baseEvent, correlationId: replayCorrelation, replay: true },
  });
  pushCheck(checks, "event-replay-idempotent", eventReplay.ok && eventReplay.payload?.status === "duplicate", { httpStatus: eventReplay.status });

  const incompatibleCorrelation = correlation();
  const incompatible = await requestJson({
    baseUrl: dispatchBaseUrl,
    pathname: "/homologation/events",
    method: "POST",
    tenantId: tenantA,
    userId,
    correlationId: incompatibleCorrelation,
    timeoutMs,
    authToken,
    body: { ...baseEvent, eventId: `${eventId}:v999`, eventVersion: "999", correlationId: incompatibleCorrelation },
  });
  pushCheck(
    checks,
    "event-unsupported-version-fail-closed",
    !incompatible.ok && incompatible.payload?.code === "asset_event.unsupported_version",
    { httpStatus: incompatible.status },
  );

  return {
    status: checks.every(check => check.status === "PASS") ? "PASS" : "FAIL",
    generatedAt: new Date().toISOString(),
    assetId,
    incidentReference,
    checks,
    correlationIds: [...new Set(correlationIds)],
  };
}

export function formatMarkdownReport(report) {
  const lines = [
    "# Homologação Externa — Inventário ↔ Despacho",
    "",
    `- Status: **${report.status}**`,
    `- Gerado em: ${report.generatedAt}`,
    ...(report.assetId ? [`- Ativo: ${report.assetId}`] : []),
    ...(report.incidentReference ? [`- Ocorrência: ${report.incidentReference}`] : []),
    "",
    "## Checks",
    "",
    ...report.checks.map(check => `- ${check.status === "PASS" ? "✅" : "❌"} ${check.name}${check.httpStatus !== undefined ? ` (HTTP ${check.httpStatus})` : ""}`),
    "",
    "## Correlation IDs",
    "",
    ...(report.correlationIds.length ? report.correlationIds.map(id => `- \`${id}\``) : ["- Nenhum correlation ID coletado."]),
  ];
  return `${lines.join("\n")}\n`;
}

function readCliOptions(env) {
  const required = ["ASSET_MOTOR_BASE_URL", "DISPATCH_BASE_URL", "TENANT_A", "TENANT_B", "HOMOLOGATION_USER_ID", "HOMOLOGATION_INCIDENT_REFERENCE"];
  const missing = required.filter(name => !env[name]);
  if (missing.length) throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(", ")}`);

  return {
    assetMotorBaseUrl: env.ASSET_MOTOR_BASE_URL,
    dispatchBaseUrl: env.DISPATCH_BASE_URL,
    tenantA: env.TENANT_A,
    tenantB: env.TENANT_B,
    userId: env.HOMOLOGATION_USER_ID,
    incidentReference: env.HOMOLOGATION_INCIDENT_REFERENCE,
    timeoutMs: Number(env.HOMOLOGATION_TIMEOUT_MS || 3000),
    authToken: env.HOMOLOGATION_AUTH_TOKEN || undefined,
  };
}

async function runCli() {
  const report = await runInventoryExternalHomologation(readCliOptions(process.env));
  const outputDir = process.env.HOMOLOGATION_REPORT_DIR || "artifacts/homologation";
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "inventory-external-homologation.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "inventory-external-homologation.md"), formatMarkdownReport(report), "utf8");
  process.stdout.write(formatMarkdownReport(report));
  if (report.status !== "PASS") process.exitCode = 1;
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
