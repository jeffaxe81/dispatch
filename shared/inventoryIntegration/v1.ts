import { z } from "zod";

export const ASSET_INVENTORY_REST_VERSION = "v1" as const;
export const ASSET_INVENTORY_ENVELOPE_VERSION = "1" as const;
export const ASSET_INVENTORY_EVENT_PRODUCER = "asset-inventory" as const;

const opaqueIdSchema = z.string().trim().min(1).max(128);
const traceIdSchema = z.string().trim().min(8).max(160);
const eventTypeSchema = z.string().trim().regex(/^[a-z][a-z0-9.-]*\.v[1-9][0-9]*$/);
const errorCodeSchema = z.string().trim().regex(/^[a-z][a-z0-9._-]{1,79}$/);

export const integrationIdentitySchema = z.object({
  tenantId: opaqueIdSchema,
  userId: opaqueIdSchema,
}).strict();

export const integrationRequestContextSchema = integrationIdentitySchema.extend({
  correlationId: traceIdSchema,
  idempotencyKey: traceIdSchema.optional(),
}).strict();

export const assetInventoryErrorEnvelopeSchema = z.object({
  envelopeVersion: z.literal(ASSET_INVENTORY_ENVELOPE_VERSION),
  correlationId: traceIdSchema,
  error: z.object({
    code: errorCodeSchema,
    message: z.string().trim().min(1).max(500),
    retryable: z.boolean(),
  }).strict(),
}).strict();

export const assetInventoryEventEnvelopeSchema = z.object({
  envelopeVersion: z.literal(ASSET_INVENTORY_ENVELOPE_VERSION),
  eventId: traceIdSchema,
  eventType: eventTypeSchema,
  occurredAt: z.string().datetime({ offset: true }),
  tenantId: opaqueIdSchema,
  correlationId: traceIdSchema,
  actorUserId: opaqueIdSchema.optional(),
  producer: z.literal(ASSET_INVENTORY_EVENT_PRODUCER),
  payload: z.record(z.string(), z.unknown()),
}).strict();

export type IntegrationIdentity = z.infer<typeof integrationIdentitySchema>;
export type IntegrationRequestContext = z.infer<typeof integrationRequestContextSchema>;
export type AssetInventoryErrorEnvelope = z.infer<typeof assetInventoryErrorEnvelopeSchema>;
export type AssetInventoryEventEnvelope = z.infer<typeof assetInventoryEventEnvelopeSchema>;
