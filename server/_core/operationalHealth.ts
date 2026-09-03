import type { Express } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { storageGetSignedUrl } from "../storage";
import { ENV } from "./env";

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

const DEFAULT_TIMEOUT_MS = 2_000;

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

async function withTimeout(
  check: () => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("healthcheck_timeout")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function evaluateReadiness(
  options: OperationalHealthOptions,
): Promise<ReadinessResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const [database, storage] = await Promise.allSettled([
    withTimeout(options.checkDatabase, timeoutMs),
    withTimeout(options.checkStorage, timeoutMs),
  ]);
  const checks: ReadinessResult["checks"] = {
    database: database.status === "fulfilled" ? "ok" : "failed",
    storage: storage.status === "fulfilled" ? "ok" : "failed",
  };

  return {
    status:
      checks.database === "ok" && checks.storage === "ok"
        ? "ready"
        : "not_ready",
    checks,
  };
}

export function registerOperationalHealthRoutes(
  app: Express,
  options: Partial<OperationalHealthOptions> = {},
): void {
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
    const result = await evaluateReadiness(resolvedOptions);
    response.set("Cache-Control", "no-store");
    response.status(result.status === "ready" ? 200 : 503).json(result);
  });
}
