import type { Express, Request } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  createAssetInventoryEventConsumer,
  type AssetInventoryEvent,
} from "./assetInventoryEventConsumer";

type Projection = Parameters<Parameters<typeof createAssetInventoryEventConsumer>[0]["upsertProjection"]>[0];
type AuditEntry = Parameters<Parameters<typeof createAssetInventoryEventConsumer>[0]["audit"]>[0];

type HomologationOptions = {
  enabled: boolean;
  isProduction: boolean;
  apiKey: string;
  upsertProjection?: (projection: Projection) => Promise<void> | void;
  audit?: (entry: AuditEntry) => Promise<void> | void;
};

function safeSecretEquals(expected: string, supplied: string) {
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function homologationKey(req: Request) {
  const dedicated = req.header("x-homologation-key");
  if (dedicated) return dedicated;
  const authorization = req.header("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "asset_event.internal_error";
  return String((error as { code?: unknown }).code || "asset_event.internal_error");
}

/**
 * Adapter exclusivo de homologação para validar o consumidor M15 via HTTP.
 * Fail-safe: em produção ou sem habilitação/chave dedicada, a rota sequer é registrada.
 */
export function registerAssetInventoryHomologationRoutes(
  app: Express,
  options: HomologationOptions,
) {
  if (!options.enabled || options.isProduction || !options.apiKey) return false;

  const consumer = createAssetInventoryEventConsumer({
    upsertProjection: options.upsertProjection ?? (() => undefined),
    audit: options.audit ?? (() => undefined),
  });

  app.post("/homologation/events", async (req, res) => {
    if (!safeSecretEquals(options.apiKey, homologationKey(req))) {
      res.status(401).json({ code: "homologation.unauthorized" });
      return;
    }

    try {
      const result = await consumer.consume(req.body as AssetInventoryEvent);
      res.status(200).json(result);
    } catch (error) {
      const code = errorCode(error);
      if (code === "asset_event.unsupported_version") {
        res.status(422).json({ code });
        return;
      }
      if (code === "asset_event.invalid") {
        res.status(400).json({ code });
        return;
      }
      console.error("Asset inventory homologation adapter failure", {
        code,
        correlationId: req.body?.correlationId ?? null,
      });
      res.status(500).json({ code: "asset_event.internal_error" });
    }
  });

  return true;
}
