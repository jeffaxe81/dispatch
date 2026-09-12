import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";

import { registerAssetInventoryHomologationRoutes } from "./assetInventoryHomologation";

async function withApp(register: (app: express.Express) => void, fn: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  register(app);
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server unavailable");
  try { await fn(`http://127.0.0.1:${address.port}`); }
  finally { server.close(); await once(server, "close"); }
}

const event = {
  eventId: "hml:event-1", eventType: "asset.updated", eventVersion: "1", tenantId: "tenant-a",
  assetId: "asset-1", assetVersion: 2, correlationId: "corr-hml-1",
  occurredAt: "2026-09-12T22:55:00.000Z", payload: { code: "PST-001", status: "ativo" },
};

describe("asset inventory homologation adapter", () => {
  it("processa e deduplica o mesmo envelope com Bearer compatível com o harness", async () => {
    await withApp(app => registerAssetInventoryHomologationRoutes(app, { enabled: true, isProduction: false, apiKey: "hml-secret" }), async baseUrl => {
      const send = () => fetch(`${baseUrl}/homologation/events`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer hml-secret" }, body: JSON.stringify(event) });
      const first = await send(); expect(first.status).toBe(200); expect(await first.json()).toMatchObject({ status: "processed", eventId: event.eventId });
      const replay = await send(); expect(replay.status).toBe(200); expect(await replay.json()).toMatchObject({ status: "duplicate", eventId: event.eventId });
    });
  });

  it("nunca registra o endpoint em produção, mesmo com flag habilitada", async () => {
    await withApp(app => registerAssetInventoryHomologationRoutes(app, { enabled: true, isProduction: true, apiKey: "hml-secret" }), async baseUrl => {
      const response = await fetch(`${baseUrl}/homologation/events`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer hml-secret" }, body: JSON.stringify(event) });
      expect(response.status).toBe(404);
    });
  });

  it("rejeita chave ausente e versão incompatível sem projetar estado", async () => {
    const projections: unknown[] = [];
    await withApp(app => registerAssetInventoryHomologationRoutes(app, { enabled: true, isProduction: false, apiKey: "hml-secret", upsertProjection: p => { projections.push(p); } }), async baseUrl => {
      const unauthorized = await fetch(`${baseUrl}/homologation/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
      expect(unauthorized.status).toBe(401);
      const unsupported = await fetch(`${baseUrl}/homologation/events`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer hml-secret" }, body: JSON.stringify({ ...event, eventId: "hml:event-999", eventVersion: "999" }) });
      expect(unsupported.status).toBe(422); expect(await unsupported.json()).toMatchObject({ code: "asset_event.unsupported_version" });
      expect(projections).toHaveLength(0);
    });
  });
});
