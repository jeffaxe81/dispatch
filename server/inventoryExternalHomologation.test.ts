import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";

async function loadHarness() {
  return import("../scripts/inventory-external-homologation.mjs");
}

async function withServer(handler: Parameters<typeof createServer>[0], fn: (baseUrl: string) => Promise<void>) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server address unavailable");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

describe("inventory external homologation harness", () => {
  it("valida fluxo feliz, tenant isolation, replay e fail-closed", async () => {
    const { runInventoryExternalHomologation } = await loadHarness();
    const calls: Array<{ url?: string; tenant?: string | string[]; correlation?: string | string[] }> = [];

    await withServer((req, res) => {
      calls.push({ url: req.url, tenant: req.headers["x-tenant-id"], correlation: req.headers["x-correlation-id"] });
      res.setHeader("content-type", "application/json");

      if (req.url?.startsWith("/api/v1/assets?") && req.method === "GET") {
        res.end(JSON.stringify({ items: [{ id: "asset-1", code: "PST-001", name: "Poste 001" }] }));
        return;
      }
      if (req.url === "/api/v1/assets/asset-1" && req.method === "GET") {
        if (req.headers["x-tenant-id"] === "tenant-b") {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: "not_found" }));
          return;
        }
        res.end(JSON.stringify({ id: "asset-1", code: "PST-001", status: "ativo" }));
        return;
      }
      if (req.url === "/api/v1/assets/asset-1/location" && req.method === "GET") {
        res.end(JSON.stringify({ latitude: -27.59, longitude: -48.55 }));
        return;
      }
      if (req.url === "/api/v1/assets/asset-1/dispatch-references" && req.method === "POST") {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.url === "/homologation/events" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", () => {
          const event = JSON.parse(body || "{}");
          if (event.eventVersion === "999") {
            res.statusCode = 422;
            res.end(JSON.stringify({ code: "asset_event.unsupported_version" }));
            return;
          }
          res.end(JSON.stringify({ status: event.replay ? "duplicate" : "processed", eventId: event.eventId }));
        });
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ code: "not_found" }));
    }, async baseUrl => {
      const report = await runInventoryExternalHomologation({
        assetMotorBaseUrl: baseUrl,
        dispatchBaseUrl: baseUrl,
        tenantA: "tenant-a",
        tenantB: "tenant-b",
        userId: "homologation-user",
        incidentReference: "INC-HML-001",
        timeoutMs: 1000,
      });

      expect(report.status).toBe("PASS");
      expect(report.checks.every((check: { status: string }) => check.status === "PASS")).toBe(true);
      expect(report.correlationIds.length).toBeGreaterThan(0);
      expect(calls.some(call => call.tenant === "tenant-a")).toBe(true);
      expect(calls.some(call => call.tenant === "tenant-b")).toBe(true);
    });
  });

  it("reporta falha controlada quando o Motor fica indisponível sem travar o harness", async () => {
    const { runInventoryExternalHomologation } = await loadHarness();
    const report = await runInventoryExternalHomologation({
      assetMotorBaseUrl: "http://127.0.0.1:1",
      dispatchBaseUrl: "http://127.0.0.1:1",
      tenantA: "tenant-a",
      tenantB: "tenant-b",
      userId: "homologation-user",
      incidentReference: "INC-HML-002",
      timeoutMs: 100,
    });

    expect(report.status).toBe("FAIL");
    expect(report.checks.some((check: { name: string; status: string }) => check.name === "motor-unavailable" && check.status === "PASS")).toBe(true);
  });
});
