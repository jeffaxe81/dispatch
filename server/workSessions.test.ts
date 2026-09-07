import { describe, expect, it } from "vitest";
import { resolveWorkSessionAction, validateWorkSessionAdjustmentReason } from "./db";

const startedAt = new Date("2026-09-07T08:00:00.000Z");
const pausedAt = new Date("2026-09-07T10:00:00.000Z");

describe("CP-016 auditable work sessions", () => {
  it("maps start to the legacy team snapshot and a start event", () => {
    expect(
      resolveWorkSessionAction(
        { startedAt: null, pausedAt: null, endedAt: null, pausedTotalSeconds: 300 },
        "start",
        startedAt,
      ),
    ).toEqual({
      teamPatch: {
        shiftStartedAt: startedAt,
        shiftEndsAt: null,
        shiftPausedAt: null,
        shiftPausedTotalSeconds: 0,
      },
      eventType: "start",
      sessionStatus: "open",
    });
  });

  it("maps pause, resume and end to historical event types", () => {
    expect(
      resolveWorkSessionAction(
        { startedAt, pausedAt: null, endedAt: null, pausedTotalSeconds: 0 },
        "pause",
        pausedAt,
      ),
    ).toMatchObject({ eventType: "pause", sessionStatus: "paused" });

    const resumeAt = new Date("2026-09-07T10:15:00.000Z");
    expect(
      resolveWorkSessionAction(
        { startedAt, pausedAt, endedAt: null, pausedTotalSeconds: 0 },
        "resume",
        resumeAt,
      ),
    ).toMatchObject({ eventType: "resume", sessionStatus: "open" });

    const endAt = new Date("2026-09-07T12:00:00.000Z");
    expect(
      resolveWorkSessionAction(
        { startedAt, pausedAt: null, endedAt: null, pausedTotalSeconds: 900 },
        "end",
        endAt,
      ),
    ).toMatchObject({ eventType: "end", sessionStatus: "closed" });
  });

  it("requires a non-empty reason for administrative adjustments", () => {
    expect(() => validateWorkSessionAdjustmentReason("   ")).toThrow("justificativa");
    expect(validateWorkSessionAdjustmentReason("Correção aprovada pelo supervisor")).toBe(
      "Correção aprovada pelo supervisor",
    );
  });
});
