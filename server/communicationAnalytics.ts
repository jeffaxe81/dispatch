import type { FilterableCommunicationSessionSummary } from "../shared/communicationMetrics";

type CommunicationEventType = "communication_started" | "communication_ready" | "communication_failed" | "communication_ended";
type CommunicationChannel = FilterableCommunicationSessionSummary["channel"];

type CommunicationEventRow = {
  eventType: CommunicationEventType | string;
  createdAt: Date;
  metadata: unknown;
};

const channels: CommunicationChannel[] = ["nao_informado", "voz", "chat", "whatsapp", "email", "video", "outro"];

function normalizeChannel(value: unknown): CommunicationChannel {
  return channels.includes(value as CommunicationChannel) ? value as CommunicationChannel : "nao_informado";
}

export function aggregateCommunicationEventRows(rows: readonly CommunicationEventRow[]): FilterableCommunicationSessionSummary[] {
  const sessions = new Map<string, FilterableCommunicationSessionSummary & { lastEventAt: Date }>();

  for (const row of rows) {
    if (!row.metadata || typeof row.metadata !== "object") continue;
    const metadata = row.metadata as Record<string, unknown>;
    const correlationId = metadata.correlationId;
    if (typeof correlationId !== "string" || correlationId.length === 0) continue;

    const current = sessions.get(correlationId) ?? {
      correlationId,
      channel: normalizeChannel(metadata.channel),
      status: "iniciada" as const,
      durationSeconds: null,
      startedAt: null,
      lastEventAt: row.createdAt,
    };

    current.channel = normalizeChannel(metadata.channel);
    current.lastEventAt = row.createdAt;

    if (row.eventType === "communication_started") {
      current.startedAt ??= row.createdAt;
      current.status = "iniciada";
    } else if (row.eventType === "communication_ready") {
      current.status = "disponivel";
    } else if (row.eventType === "communication_failed") {
      current.status = "falhou";
    } else if (row.eventType === "communication_ended") {
      current.status = "encerrada";
      current.durationSeconds = current.startedAt
        ? Math.max(0, Math.round((row.createdAt.getTime() - current.startedAt.getTime()) / 1000))
        : null;
    }

    sessions.set(correlationId, current);
  }

  return Array.from(sessions.values())
    .sort((a, b) => b.lastEventAt.getTime() - a.lastEventAt.getTime())
    .map(({ lastEventAt: _lastEventAt, ...session }) => session);
}
