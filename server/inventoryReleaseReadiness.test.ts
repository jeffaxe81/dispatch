import { describe, expect, it, vi } from "vitest";
import { buildInventoryReleaseReadiness } from "./inventoryReleaseReadiness";
import { createAssetInventoryEventConsumer } from "./assetInventoryEventConsumer";

const allGreen = {
  tenantIsolation: true,
  negativeAuthorization: true,
  restContract: true,
  eventContract: true,
  auditCorrelation: true,
  minimumLoad: true,
  dependencyCheck: true,
  build: true,
  rollbackPlan: true,
  operationalManual: true,
} as const;

describe("M16 inventory release readiness", () => {
  it("só declara release-ready quando todos os gates transversais estão GREEN", () => {
    expect(buildInventoryReleaseReadiness(allGreen)).toEqual({ ready: true, blockers: [] });
    expect(buildInventoryReleaseReadiness({ ...allGreen, tenantIsolation: false, rollbackPlan: false })).toEqual({
      ready: false,
      blockers: ["tenantIsolation", "rollbackPlan"],
    });
  });

  it("mantém versão incompatível em fail-closed sem efeitos colaterais", async () => {
    const upsertProjection = vi.fn();
    const consumer = createAssetInventoryEventConsumer({ upsertProjection, audit: vi.fn() });
    await expect(consumer.consume({
      eventId: "evt-unsupported",
      eventType: "asset.updated",
      eventVersion: "999",
      tenantId: "tenant-a",
      assetId: "asset-1",
      assetVersion: 1,
      correlationId: "corr-m16-1",
      occurredAt: "2026-09-12T21:30:00.000Z",
      payload: {},
    })).rejects.toMatchObject({ code: "asset_event.unsupported_version" });
    expect(upsertProjection).not.toHaveBeenCalled();
  });

  it("suporta carga mínima de eventos distintos sem duplicar projeções", async () => {
    const upsertProjection = vi.fn().mockResolvedValue(undefined);
    const consumer = createAssetInventoryEventConsumer({ upsertProjection, audit: vi.fn() });
    for (let i = 0; i < 250; i += 1) {
      await consumer.consume({
        eventId: `evt-load-${i}`,
        eventType: "asset.updated",
        eventVersion: "1",
        tenantId: "tenant-load",
        assetId: `asset-${i}`,
        assetVersion: 1,
        correlationId: `corr-load-${i}`,
        occurredAt: "2026-09-12T21:30:00.000Z",
        payload: { status: "ativo" },
      });
    }
    expect(upsertProjection).toHaveBeenCalledTimes(250);
  });
});
