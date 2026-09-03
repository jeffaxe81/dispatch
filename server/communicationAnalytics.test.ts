import { describe, expect, it } from "vitest";
import { aggregateCommunicationEventRows } from "./communicationAnalytics";

describe("communication analytics aggregation", () => {
  it("consolidates correlated lifecycle events into technical sessions", () => {
    const sessions = aggregateCommunicationEventRows([
      { eventType: "communication_started", createdAt: new Date("2026-09-03T10:00:00Z"), metadata: { correlationId: "corr-001", applicationId: "neo-interact", channel: "voz", classification: "sessao_integrada" } },
      { eventType: "communication_ready", createdAt: new Date("2026-09-03T10:00:05Z"), metadata: { correlationId: "corr-001", applicationId: "neo-interact", channel: "voz", classification: "sessao_integrada" } },
      { eventType: "communication_ended", createdAt: new Date("2026-09-03T10:01:30Z"), metadata: { correlationId: "corr-001", applicationId: "neo-interact", channel: "voz", classification: "sessao_integrada" } },
      { eventType: "communication_started", createdAt: new Date("2026-09-03T11:00:00Z"), metadata: { correlationId: "corr-002", applicationId: "neo-interact" } },
      { eventType: "communication_failed", createdAt: new Date("2026-09-03T11:00:10Z"), metadata: { correlationId: "corr-002", applicationId: "neo-interact" } },
    ]);

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ correlationId: "corr-002", status: "falhou", channel: "nao_informado", durationSeconds: null });
    expect(sessions[1]).toMatchObject({ correlationId: "corr-001", status: "encerrada", channel: "voz", durationSeconds: 90 });
  });
});
