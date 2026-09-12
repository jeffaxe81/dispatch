import { describe, expect, it, vi } from "vitest";
import { createAssetInventoryEventConsumer } from "./assetInventoryEventConsumer";

const validEvent = {
  eventId: "asset:tenant-a:asset-1:v2:asset.updated",
  eventType: "asset.updated",
  eventVersion: "1",
  tenantId: "tenant-a",
  assetId: "asset-1",
  assetVersion: 2,
  correlationId: "corr-asset-event-0001",
  occurredAt: "2026-09-12T18:30:00.000Z",
  payload: { code: "PST-001", status: "ativo" },
};

describe("M15 AssetInventoryEventConsumer", () => {
  it("processa uma vez o mesmo evento e preserva correlação/auditoria", async () => {
    const upsertProjection = vi.fn().mockResolvedValue(undefined);
    const audit = vi.fn().mockResolvedValue(undefined);
    const consumer = createAssetInventoryEventConsumer({ upsertProjection, audit });

    const first = await consumer.consume(validEvent);
    const replay = await consumer.consume(validEvent);

    expect(first).toEqual({ status: "processed", eventId: validEvent.eventId });
    expect(replay).toEqual({ status: "duplicate", eventId: validEvent.eventId });
    expect(upsertProjection).toHaveBeenCalledTimes(1);
    expect(upsertProjection).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", assetId: "asset-1", assetVersion: 2 }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventId: validEvent.eventId, correlationId: validEvent.correlationId, result: "processed" }));
  });

  it("falha fechado para versão de envelope desconhecida sem alterar projeções", async () => {
    const upsertProjection = vi.fn();
    const consumer = createAssetInventoryEventConsumer({ upsertProjection, audit: vi.fn() });

    await expect(consumer.consume({ ...validEvent, eventVersion: "999" })).rejects.toMatchObject({ code: "asset_event.unsupported_version" });
    expect(upsertProjection).not.toHaveBeenCalled();
  });

  it("ignora de forma segura tipo desconhecido e não altera estado crítico do Despacho", async () => {
    const upsertProjection = vi.fn();
    const mutateIncidentState = vi.fn();
    const consumer = createAssetInventoryEventConsumer({ upsertProjection, audit: vi.fn(), mutateIncidentState });

    const result = await consumer.consume({ ...validEvent, eventType: "asset.future.experimental" });

    expect(result).toEqual({ status: "ignored", eventId: validEvent.eventId });
    expect(upsertProjection).not.toHaveBeenCalled();
    expect(mutateIncidentState).not.toHaveBeenCalled();
  });

  it("isola deduplicação por tenant e eventId", async () => {
    const upsertProjection = vi.fn().mockResolvedValue(undefined);
    const consumer = createAssetInventoryEventConsumer({ upsertProjection, audit: vi.fn() });

    await consumer.consume(validEvent);
    await consumer.consume({ ...validEvent, tenantId: "tenant-b" });

    expect(upsertProjection).toHaveBeenCalledTimes(2);
  });
});
