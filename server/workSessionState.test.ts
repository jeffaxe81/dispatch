import { describe, expect, it } from "vitest";
import {
  buildAdministrativeAdjustment,
  resolveWorkSessionAction,
} from "./workSessionState";

const startedAt = new Date("2026-09-03T08:00:00.000Z");
const pausedAt = new Date("2026-09-03T10:00:00.000Z");

describe("CP-016 auditable work-session state", () => {
  it("starts a session and emits the historical start event", () => {
    expect(
      resolveWorkSessionAction(
        { status: "closed", startedAt: null, endedAt: null, pausedAt: null, totalPauseSeconds: 300 },
        "start",
        startedAt,
      ),
    ).toEqual({
      sessionPatch: {
        status: "open",
        startedAt,
        endedAt: null,
        pausedAt: null,
        totalPauseSeconds: 0,
      },
      snapshotPatch: {
        shiftStartedAt: startedAt,
        shiftEndsAt: null,
        shiftPausedAt: null,
        shiftPausedTotalSeconds: 0,
      },
      event: { eventType: "start", occurredAt: startedAt },
    });
  });

  it("pauses and resumes while accumulating only elapsed pause time", () => {
    const pause = resolveWorkSessionAction(
      { status: "open", startedAt, endedAt: null, pausedAt: null, totalPauseSeconds: 120 },
      "pause",
      pausedAt,
    );
    expect(pause.sessionPatch).toEqual({ status: "paused", pausedAt });
    expect(pause.snapshotPatch).toEqual({ shiftPausedAt: pausedAt });
    expect(pause.event).toEqual({ eventType: "pause", occurredAt: pausedAt });

    const resumedAt = new Date("2026-09-03T10:15:30.000Z");
    const resume = resolveWorkSessionAction(
      { status: "paused", startedAt, endedAt: null, pausedAt, totalPauseSeconds: 120 },
      "resume",
      resumedAt,
    );
    expect(resume.sessionPatch).toEqual({
      status: "open",
      pausedAt: null,
      totalPauseSeconds: 1050,
    });
    expect(resume.snapshotPatch).toEqual({
      shiftPausedAt: null,
      shiftPausedTotalSeconds: 1050,
    });
    expect(resume.event).toEqual({ eventType: "resume", occurredAt: resumedAt });
  });

  it("ends an open session and marks the team snapshot as ended", () => {
    const endedAt = new Date("2026-09-03T20:00:00.000Z");
    expect(
      resolveWorkSessionAction(
        { status: "open", startedAt, endedAt: null, pausedAt: null, totalPauseSeconds: 900 },
        "end",
        endedAt,
      ),
    ).toEqual({
      sessionPatch: { status: "closed", endedAt, pausedAt: null },
      snapshotPatch: {
        shiftEndsAt: endedAt,
        shiftPausedAt: null,
        shiftPausedTotalSeconds: 900,
      },
      event: { eventType: "end", occurredAt: endedAt },
    });
  });

  it("rejects incompatible transitions", () => {
    expect(() =>
      resolveWorkSessionAction(
        { status: "closed", startedAt: null, endedAt: null, pausedAt: null, totalPauseSeconds: 0 },
        "pause",
      ),
    ).toThrow("Inicie a jornada");
    expect(() =>
      resolveWorkSessionAction(
        { status: "open", startedAt, endedAt: null, pausedAt: null, totalPauseSeconds: 0 },
        "resume",
      ),
    ).toThrow("não está em pausa");
  });

  it("requires a reason for administrative adjustments", () => {
    expect(() =>
      buildAdministrativeAdjustment({ reason: "  ", actorUserId: 1, occurredAt: startedAt }),
    ).toThrow("justificativa");

    expect(
      buildAdministrativeAdjustment({
        reason: "Correção aprovada pelo supervisor",
        actorUserId: 7,
        occurredAt: startedAt,
      }),
    ).toEqual({
      eventType: "adjustment",
      actorUserId: 7,
      occurredAt: startedAt,
      reason: "Correção aprovada pelo supervisor",
      requiresAuditLog: true,
    });
  });
});
