import { describe, expect, it } from "vitest";
import { buildCp016ShiftPersistencePlan } from "./cp016WorkSessions";

const startedAt = new Date("2026-09-03T08:00:00.000Z");
const pausedAt = new Date("2026-09-03T10:00:00.000Z");

describe("CP-016 transactional shift persistence plan", () => {
  it("plans a new work session and available presence when a shift starts", () => {
    const result = buildCp016ShiftPersistencePlan({
      action: "start",
      now: startedAt,
      teamSnapshot: {
        shiftStartedAt: null,
        shiftPausedAt: null,
        shiftEndsAt: null,
        shiftPausedTotalSeconds: 0,
        status: "disponivel",
      },
      activeSession: null,
    });

    expect(result.teamPatch).toMatchObject({
      shiftStartedAt: startedAt,
      shiftPausedAt: null,
      shiftEndsAt: null,
      shiftPausedTotalSeconds: 0,
    });
    expect(result.sessionOperation).toMatchObject({ type: "create", status: "open", startedAt });
    expect(result.event).toMatchObject({ eventType: "start", occurredAt: startedAt });
    expect(result.presence).toEqual({ status: "available", availableForDispatch: true });
  });

  it("plans pause event and blocks dispatch while paused", () => {
    const result = buildCp016ShiftPersistencePlan({
      action: "pause",
      now: pausedAt,
      teamSnapshot: {
        shiftStartedAt: startedAt,
        shiftPausedAt: null,
        shiftEndsAt: null,
        shiftPausedTotalSeconds: 0,
        status: "disponivel",
      },
      activeSession: {
        id: 7,
        startedAt,
        pausedAt: null,
        endedAt: null,
        totalPauseSeconds: 0,
        status: "open",
      },
    });

    expect(result.sessionOperation).toMatchObject({ type: "update", id: 7, status: "paused", pausedAt });
    expect(result.event.eventType).toBe("pause");
    expect(result.presence).toEqual({ status: "paused", availableForDispatch: false });
  });

  it("plans resume and accumulated pause time", () => {
    const resumedAt = new Date("2026-09-03T10:15:30.000Z");
    const result = buildCp016ShiftPersistencePlan({
      action: "resume",
      now: resumedAt,
      teamSnapshot: {
        shiftStartedAt: startedAt,
        shiftPausedAt: pausedAt,
        shiftEndsAt: null,
        shiftPausedTotalSeconds: 0,
        status: "disponivel",
      },
      activeSession: {
        id: 7,
        startedAt,
        pausedAt,
        endedAt: null,
        totalPauseSeconds: 0,
        status: "paused",
      },
    });

    expect(result.teamPatch.shiftPausedTotalSeconds).toBe(930);
    expect(result.sessionOperation).toMatchObject({ type: "update", id: 7, status: "open", pausedAt: null, totalPauseSeconds: 930 });
    expect(result.event.eventType).toBe("resume");
    expect(result.presence).toEqual({ status: "available", availableForDispatch: true });
  });

  it("plans closing the session and out-of-shift presence", () => {
    const endedAt = new Date("2026-09-03T20:00:00.000Z");
    const result = buildCp016ShiftPersistencePlan({
      action: "end",
      now: endedAt,
      teamSnapshot: {
        shiftStartedAt: startedAt,
        shiftPausedAt: null,
        shiftEndsAt: null,
        shiftPausedTotalSeconds: 930,
        status: "disponivel",
      },
      activeSession: {
        id: 7,
        startedAt,
        pausedAt: null,
        endedAt: null,
        totalPauseSeconds: 930,
        status: "open",
      },
    });

    expect(result.sessionOperation).toMatchObject({ type: "update", id: 7, status: "closed", endedAt });
    expect(result.event.eventType).toBe("end");
    expect(result.presence).toEqual({ status: "out_of_shift", availableForDispatch: false });
  });

  it("requires an active historical session for pause, resume and end", () => {
    expect(() => buildCp016ShiftPersistencePlan({
      action: "pause",
      now: pausedAt,
      teamSnapshot: {
        shiftStartedAt: startedAt,
        shiftPausedAt: null,
        shiftEndsAt: null,
        shiftPausedTotalSeconds: 0,
        status: "disponivel",
      },
      activeSession: null,
    })).toThrow("Sessão de trabalho ativa não encontrada");
  });
});
