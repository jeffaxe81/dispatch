import { describe, expect, it } from "vitest";
import { summarizeCommunicationSessions, summarizeFilteredCommunicationSessions } from "./communicationMetrics";

describe("communication metrics", () => {
  it("summarizes totals, failures, active sessions, durations and channels", () => {
    const result = summarizeCommunicationSessions([
      { correlationId: "a", channel: "voz", status: "encerrada", durationSeconds: 120 },
      { correlationId: "b", channel: "chat", status: "falhou", durationSeconds: null },
      { correlationId: "c", channel: "voz", status: "disponivel", durationSeconds: null },
    ]);

    expect(result.totalSessions).toBe(3);
    expect(result.completedSessions).toBe(1);
    expect(result.failedSessions).toBe(1);
    expect(result.activeSessions).toBe(1);
    expect(result.totalDurationSeconds).toBe(120);
    expect(result.averageDurationSeconds).toBe(120);
    expect(result.byChannel.voz).toBe(2);
    expect(result.byChannel.chat).toBe(1);
  });

  it("filters consolidated metrics by period, channel and status before summarizing", () => {
    const result = summarizeFilteredCommunicationSessions([
      { correlationId: "a", channel: "voz", status: "encerrada", durationSeconds: 120, startedAt: new Date("2026-09-01T10:00:00Z") },
      { correlationId: "b", channel: "chat", status: "falhou", durationSeconds: null, startedAt: new Date("2026-09-02T10:00:00Z") },
      { correlationId: "c", channel: "voz", status: "encerrada", durationSeconds: 60, startedAt: new Date("2026-09-03T10:00:00Z") },
    ], {
      startDate: new Date("2026-09-02T00:00:00Z"),
      endDate: new Date("2026-09-03T23:59:59Z"),
      channel: "voz",
      status: "encerrada",
    });

    expect(result.totalSessions).toBe(1);
    expect(result.completedSessions).toBe(1);
    expect(result.totalDurationSeconds).toBe(60);
    expect(result.byChannel.voz).toBe(1);
    expect(result.byChannel.chat).toBe(0);
  });
});
