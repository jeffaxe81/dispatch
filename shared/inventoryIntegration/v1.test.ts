import { describe, expect, it } from "vitest";

const contractModulePath = "./v1";
const loadContracts = () => import(contractModulePath);

describe("M0 inventory integration contract v1", () => {
  it("publishes explicit REST and envelope versions", async () => {
    const contract = await loadContracts();

    expect(contract.ASSET_INVENTORY_REST_VERSION).toBe("v1");
    expect(contract.ASSET_INVENTORY_ENVELOPE_VERSION).toBe("1");
    expect(contract.ASSET_INVENTORY_EVENT_PRODUCER).toBe("asset-inventory");
  });

  it("requires opaque tenant and user identity and rejects extra identity fields", async () => {
    const { integrationIdentitySchema } = await loadContracts();

    expect(integrationIdentitySchema.parse({ tenantId: "tenant-01", userId: "user-42" })).toEqual({
      tenantId: "tenant-01",
      userId: "user-42",
    });
    expect(() => integrationIdentitySchema.parse({ tenantId: "tenant-01" })).toThrow();
    expect(() => integrationIdentitySchema.parse({ tenantId: "", userId: "user-42" })).toThrow();
    expect(() => integrationIdentitySchema.parse({ tenantId: "tenant-01", userId: "user-42", role: "admin" })).toThrow();
  });

  it("requires correlation and validates an optional idempotency key", async () => {
    const { integrationRequestContextSchema } = await loadContracts();

    expect(integrationRequestContextSchema.parse({
      tenantId: "tenant-01",
      userId: "user-42",
      correlationId: "corr-20260912-0001",
      idempotencyKey: "cmd-20260912-0001",
    })).toEqual({
      tenantId: "tenant-01",
      userId: "user-42",
      correlationId: "corr-20260912-0001",
      idempotencyKey: "cmd-20260912-0001",
    });
    expect(() => integrationRequestContextSchema.parse({ tenantId: "tenant-01", userId: "user-42" })).toThrow();
    expect(() => integrationRequestContextSchema.parse({
      tenantId: "tenant-01",
      userId: "user-42",
      correlationId: "corr-20260912-0001",
      idempotencyKey: " ",
    })).toThrow();
  });

  it("uses a strict error envelope without stack leakage", async () => {
    const { assetInventoryErrorEnvelopeSchema } = await loadContracts();
    const error = {
      envelopeVersion: "1",
      correlationId: "corr-20260912-0001",
      error: {
        code: "asset.not_found",
        message: "Ativo não localizado",
        retryable: false,
      },
    };

    expect(assetInventoryErrorEnvelopeSchema.parse(error)).toEqual(error);
    expect(() => assetInventoryErrorEnvelopeSchema.parse({
      ...error,
      error: { ...error.error, stack: "internal stack" },
    })).toThrow();
    expect(() => assetInventoryErrorEnvelopeSchema.parse({ ...error, internalSql: "select *" })).toThrow();
  });

  it("validates the canonical asset event envelope", async () => {
    const { assetInventoryEventEnvelopeSchema } = await loadContracts();
    const event = {
      envelopeVersion: "1",
      eventId: "evt-20260912-0001",
      eventType: "asset.updated.v1",
      occurredAt: "2026-09-12T13:30:00.000Z",
      tenantId: "tenant-01",
      correlationId: "corr-20260912-0001",
      actorUserId: "user-42",
      producer: "asset-inventory",
      payload: { assetId: "asset-123" },
    };

    expect(assetInventoryEventEnvelopeSchema.parse(event)).toEqual(event);
    expect(() => assetInventoryEventEnvelopeSchema.parse({ ...event, tenantId: "" })).toThrow();
    expect(() => assetInventoryEventEnvelopeSchema.parse({ ...event, occurredAt: "12/09/2026" })).toThrow();
    expect(() => assetInventoryEventEnvelopeSchema.parse({ ...event, producer: "dispatch" })).toThrow();
  });
});
