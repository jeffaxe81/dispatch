import express, { type Express } from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHealthRegistry } from "./healthRegistry";
import { registerOperationalHealthRoutes } from "./operationalHealth";

const openServers = new Set<Server>();

async function request(app: Express, path: string) {
  const server = await new Promise<Server>(resolve => {
    const listeningServer = app.listen(0, "127.0.0.1", () => resolve(listeningServer));
  });
  openServers.add(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta efêmera indisponível");
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    body: await response.json(),
  };
}

afterEach(async () => {
  await Promise.all([...openServers].map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
  openServers.clear();
});

describe("D-011A registry-backed HTTP health", () => {
  it("mantém liveness independente mesmo quando o registry falharia", async () => {
    const probe = vi.fn(async () => { throw new Error("segredo interno"); });
    const registry = createHealthRegistry([{
      id: "critical",
      name: "Crítico",
      criticality: "critical",
      blocksReadiness: true,
      timeoutMs: 20,
      evidenceTtlMs: 1_000,
      probe,
    }]);
    const app = express();
    registerOperationalHealthRoutes(app, { registry } as any);

    await expect(request(app, "/health/live")).resolves.toEqual({
      status: 200,
      cacheControl: "no-store",
      body: { status: "alive" },
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it("responde 200 degraded para componente não bloqueante degradado", async () => {
    const registry = createHealthRegistry([
      {
        id: "database",
        name: "Banco",
        criticality: "critical",
        blocksReadiness: true,
        timeoutMs: 20,
        evidenceTtlMs: 1_000,
        probe: vi.fn(async () => "healthy" as const),
      },
      {
        id: "neo",
        name: "Comunicação",
        criticality: "optional",
        blocksReadiness: false,
        timeoutMs: 20,
        evidenceTtlMs: 1_000,
        probe: vi.fn(async () => "degraded" as const),
      },
    ]);
    const app = express();
    registerOperationalHealthRoutes(app, { registry } as any);

    await expect(request(app, "/health/ready")).resolves.toEqual({
      status: 200,
      cacheControl: "no-store",
      body: {
        status: "degraded",
        components: { database: "healthy", neo: "degraded" },
      },
    });
  });

  it("responde 503 not_ready e não vaza erro de componente bloqueante", async () => {
    const registry = createHealthRegistry([{
      id: "database",
      name: "Banco",
      criticality: "critical",
      blocksReadiness: true,
      timeoutMs: 20,
      evidenceTtlMs: 1_000,
      probe: vi.fn(async () => { throw new Error("mysql://user:pass@host Bearer secret stack"); }),
    }]);
    const app = express();
    registerOperationalHealthRoutes(app, { registry } as any);

    const result = await request(app, "/health/ready");
    expect(result).toEqual({
      status: 503,
      cacheControl: "no-store",
      body: { status: "not_ready", components: { database: "unhealthy" } },
    });
    expect(JSON.stringify(result.body)).not.toMatch(/mysql:\/\/|Bearer|user:pass|stack/i);
  });
});
