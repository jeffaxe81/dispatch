export type AssetInventoryEvent = {
  eventId: string;
  eventType: string;
  eventVersion: string;
  tenantId: string;
  assetId: string;
  assetVersion: number;
  correlationId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

type Projection = {
  tenantId: string;
  assetId: string;
  assetVersion: number;
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

type AuditEntry = {
  tenantId: string;
  assetId: string;
  eventId: string;
  eventType: string;
  correlationId: string;
  result: "processed" | "duplicate" | "ignored" | "rejected";
};

type Dependencies = {
  upsertProjection: (projection: Projection) => Promise<void> | void;
  audit: (entry: AuditEntry) => Promise<void> | void;
  mutateIncidentState?: (...args: unknown[]) => Promise<void> | void;
};

export type AssetInventoryEventResult = {
  status: "processed" | "duplicate" | "ignored";
  eventId: string;
};

const SUPPORTED_ENVELOPE_VERSION = "1";
const PROJECTION_EVENT_TYPES = new Set(["asset.created", "asset.updated"]);

function eventError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function validateEnvelope(event: AssetInventoryEvent) {
  if (!event || typeof event !== "object") {
    throw eventError("asset_event.invalid", "Evento de ativo inválido");
  }
  if (!event.eventId || !event.tenantId || !event.assetId || !event.correlationId) {
    throw eventError("asset_event.invalid", "Envelope de evento incompleto");
  }
  if (!Number.isInteger(event.assetVersion) || event.assetVersion < 1) {
    throw eventError("asset_event.invalid", "Versão do ativo inválida");
  }
}

/**
 * Consumidor M15. Mantém apenas uma projeção autorizada do contexto do ativo.
 * Não recebe dependência para alterar estado crítico da ocorrência de forma automática.
 * A deduplicação em memória é o limite desta camada; o adaptador de transporte/persistência
 * pode fornecer durabilidade sem mudar o contrato do consumidor.
 */
export function createAssetInventoryEventConsumer(dependencies: Dependencies) {
  const processed = new Set<string>();

  return {
    async consume(event: AssetInventoryEvent): Promise<AssetInventoryEventResult> {
      validateEnvelope(event);

      if (event.eventVersion !== SUPPORTED_ENVELOPE_VERSION) {
        await dependencies.audit({
          tenantId: event.tenantId,
          assetId: event.assetId,
          eventId: event.eventId,
          eventType: event.eventType,
          correlationId: event.correlationId,
          result: "rejected",
        });
        throw eventError("asset_event.unsupported_version", `Versão de envelope não suportada: ${event.eventVersion}`);
      }

      const deduplicationKey = `${event.tenantId}\u0000${event.eventId}`;
      if (processed.has(deduplicationKey)) {
        await dependencies.audit({
          tenantId: event.tenantId,
          assetId: event.assetId,
          eventId: event.eventId,
          eventType: event.eventType,
          correlationId: event.correlationId,
          result: "duplicate",
        });
        return { status: "duplicate", eventId: event.eventId };
      }

      if (!PROJECTION_EVENT_TYPES.has(event.eventType)) {
        processed.add(deduplicationKey);
        await dependencies.audit({
          tenantId: event.tenantId,
          assetId: event.assetId,
          eventId: event.eventId,
          eventType: event.eventType,
          correlationId: event.correlationId,
          result: "ignored",
        });
        return { status: "ignored", eventId: event.eventId };
      }

      await dependencies.upsertProjection({
        tenantId: event.tenantId,
        assetId: event.assetId,
        assetVersion: event.assetVersion,
        eventId: event.eventId,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        payload: { ...event.payload },
      });
      processed.add(deduplicationKey);
      await dependencies.audit({
        tenantId: event.tenantId,
        assetId: event.assetId,
        eventId: event.eventId,
        eventType: event.eventType,
        correlationId: event.correlationId,
        result: "processed",
      });
      return { status: "processed", eventId: event.eventId };
    },
  };
}
