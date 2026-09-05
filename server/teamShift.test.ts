import { describe, expect, it } from "vitest";
import { resolveTeamShiftAction, resolveTeamShiftPersistence } from "./db";

const startedAt = new Date("2026-08-22T08:00:00.000Z");
const pausedAt = new Date("2026-08-22T10:00:00.000Z");

describe("jornada operacional da equipe", () => {
  it("registra início, pausa, retorno e encerramento acumulando apenas o tempo de pausa", () => {
    const start = resolveTeamShiftAction({ startedAt: null, pausedAt: null, endedAt: null, pausedTotalSeconds: 300 }, "start", startedAt);
    expect(start).toEqual({ shiftStartedAt: startedAt, shiftEndsAt: null, shiftPausedAt: null, shiftPausedTotalSeconds: 0 });

    const pause = resolveTeamShiftAction({ startedAt, pausedAt: null, endedAt: null, pausedTotalSeconds: 0 }, "pause", pausedAt);
    expect(pause).toEqual({ shiftPausedAt: pausedAt });

    const resumeAt = new Date("2026-08-22T10:15:30.000Z");
    const resume = resolveTeamShiftAction({ startedAt, pausedAt, endedAt: null, pausedTotalSeconds: 120 }, "resume", resumeAt);
    expect(resume).toEqual({ shiftPausedAt: null, shiftPausedTotalSeconds: 1050 });

    const endAt = new Date("2026-08-22T12:00:00.000Z");
    const end = resolveTeamShiftAction({ startedAt, pausedAt: null, endedAt: null, pausedTotalSeconds: 1050 }, "end", endAt);
    expect(end).toEqual({ shiftEndsAt: endAt, shiftPausedAt: null, shiftPausedTotalSeconds: 1050 });
  });

  it("rejeita transições incompatíveis com o estado atual da jornada", () => {
    expect(() => resolveTeamShiftAction({ startedAt: null, pausedAt: null, endedAt: null, pausedTotalSeconds: 0 }, "pause")).toThrow("Inicie a jornada");
    expect(() => resolveTeamShiftAction({ startedAt, pausedAt: null, endedAt: null, pausedTotalSeconds: 0 }, "resume")).toThrow("não está em pausa");
    expect(() => resolveTeamShiftAction({ startedAt, pausedAt: null, endedAt: null, pausedTotalSeconds: 0 }, "start")).toThrow("já está em andamento");
  });

  it("mantém o snapshot legado e descreve o evento histórico de cada ação", () => {
    const start = resolveTeamShiftPersistence(
      { startedAt: null, pausedAt: null, endedAt: null, pausedTotalSeconds: 300 },
      "start",
      startedAt,
    );
    expect(start).toEqual({
      teamPatch: { shiftStartedAt: startedAt, shiftEndsAt: null, shiftPausedAt: null, shiftPausedTotalSeconds: 0 },
      eventType: "start",
      sessionStatus: "open",
      totalPauseSeconds: 0,
      endedAt: null,
    });

    const pause = resolveTeamShiftPersistence(
      { startedAt, pausedAt: null, endedAt: null, pausedTotalSeconds: 0 },
      "pause",
      pausedAt,
    );
    expect(pause).toEqual({
      teamPatch: { shiftPausedAt: pausedAt },
      eventType: "pause",
      sessionStatus: "paused",
      totalPauseSeconds: 0,
      endedAt: null,
    });

    const resumeAt = new Date("2026-08-22T10:15:30.000Z");
    const resume = resolveTeamShiftPersistence(
      { startedAt, pausedAt, endedAt: null, pausedTotalSeconds: 120 },
      "resume",
      resumeAt,
    );
    expect(resume).toEqual({
      teamPatch: { shiftPausedAt: null, shiftPausedTotalSeconds: 1050 },
      eventType: "resume",
      sessionStatus: "open",
      totalPauseSeconds: 1050,
      endedAt: null,
    });

    const endAt = new Date("2026-08-22T12:00:00.000Z");
    const end = resolveTeamShiftPersistence(
      { startedAt, pausedAt: null, endedAt: null, pausedTotalSeconds: 1050 },
      "end",
      endAt,
    );
    expect(end).toEqual({
      teamPatch: { shiftEndsAt: endAt, shiftPausedAt: null, shiftPausedTotalSeconds: 1050 },
      eventType: "end",
      sessionStatus: "closed",
      totalPauseSeconds: 1050,
      endedAt: endAt,
    });
  });
});
