import type { Express } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { storageGetSignedUrl } from "../storage";
import { ENV } from "./env";
import { createHealthRegistry, type HealthRegistry } from "./healthRegistry";

export type HealthCheckState = "ok" | "failed";

export type ReadinessResult = {
  status: "ready" | "not_ready";
  checks: {
    database: HealthCheckState;
    storage: HealthCheckState;
  };
};

export type OperationalHealthOptions = {
  checkDatabase: () => Promise<void>;
  checkStorage: () => Promise<void>;
  timeoutMs?: number;
};

export type OperationalHealthRouteOptions = Partial<OperationalHealthOptions> & {
  registry?: HealthRegistry;
};

const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_EVIDENCE_TTL_MS = 10_000;

export async function checkDatabaseReady(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("database_unavailable");
  await db.execute(sql`SELECT 1`);
}

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

export async function checkStorageReady(
  key = ENV.storageHealthcheckKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    throw new Error("storage_healthcheck_key_missing");
  }

  const signedUrl = await storageGetSignedUrl(normalizedKey);
  if (!signedUrl.trim()) throw new Error("storage_signed_url_missing");

  const response = await fetch(signedUrl, {
    method: "GET",
    headers: { Range: "bytes=0-0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  await cancelResponseBody(response);

  if (response.status !== 200 && response.status !== 206) {
    throw new Error("storage_unavailable");
  }
}

export function createOperationalHealthRegistry(
  options: Partial<OperationalHealthOptions> = {},
): HealthRegistry {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const checkDatabase = options.checkDatabase ?? checkDatabaseReady;
  const checkStorage = options.checkStorage ?? checkStorageReady;

  return createHealthRegistry([
    {
      id: "database",
      name: "Banco de dados",
      criticality: "critical",
      blocksReadiness: true,
      timeoutMs,
      evidenceTtlMs: DEFAULT_EVIDENCE_TTL_MS,
      probe: async () => {
        await checkDatabase();
        return "healthy";
      },
    },
    {
      id: "storage",
      name: "Armazenamento",
      criticality: "critical",
      blocksReadiness: true,
      timeoutMs,
      evidenceTtlMs: DEFAULT_EVIDENCE_TTL_MS,
      probe: async () => {
        await checkStorage();
        return "healthy";
      },
    },
  ]);
}

export async function evaluateReadiness(
  options: OperationalHealthOptions,
): Promise<ReadinessResult> {
  const snapshot = await createOperationalHealthRegistry(options).probeAll();
  const stateById = new Map(snapshot.components.map(component => [component.id, component.state]));
  const checks: ReadinessResult["checks"] = {
    database: stateById.get("database") === "healthy" ? "ok" : "failed",
    storage: stateById.get("storage") === "healthy" ? "ok" : "failed",
  };

  return {
    status: snapshot.status === "not_ready" ? "not_ready" : "ready",
    checks,
  };
}

export function registerOperationalHealthRoutes(
  app: Express,
  options: OperationalHealthRouteOptions = {},
): void {
  const injectedRegistry = options.registry;
  const resolvedOptions: OperationalHealthOptions = {
    checkDatabase: options.checkDatabase ?? checkDatabaseReady,
    checkStorage: options.checkStorage ?? checkStorageReady,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  app.get("/health/live", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.status(200).json({ status: "alive" });
  });

  app.get("/health/ready", async (_request, response) => {
    response.set("Cache-Control", "no-store");

    if (injectedRegistry) {
      const snapshot = await injectedRegistry.probeAll();
      const components = Object.fromEntries(
        snapshot.components.map(component => [component.id, component.state]),
      );
      response
        .status(snapshot.status === "not_ready" ? 503 : 200)
        .json({ status: snapshot.status, components });
      return;
    }

    const result = await evaluateReadiness(resolvedOptions);
    response.status(result.status === "ready" ? 200 : 503).json(result);
  });
}
