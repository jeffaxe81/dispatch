import { describe, expect, it } from "vitest";
import { summarizeCommunicationSessions } from "./communicationMetrics";

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
});
