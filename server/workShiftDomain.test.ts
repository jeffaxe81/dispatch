import { describe, expect, it } from "vitest";
import { resolveWorkShiftTransition } from "./workShiftDomain";

const startAt = new Date("2026-09-04T08:00:00.000Z");

const active = {
  id: 10,
  startedAt: startAt,
  pausedAt: null,
  endedAt: null,
  status: "active" as const,
  pausedSeconds: 0,
};

describe("work shift domain", () => {
  it("inicia uma nova sessão somente quando não existe sessão aberta", () => {
    expect(resolveWorkShiftTransition(null, "start", startAt)).toMatchObject({
      mode: "create",
      eventType: "started",
      session: {
        status: "active",
        startedAt: startAt,
        pausedSeconds: 0,
        workedSeconds: 0,
      },
    });
  });

  it("acumula pausas em resume e calcula tempo líquido ao encerrar", () => {
    const pauseAt = new Date("2026-09-04T10:00:00.000Z");
    const resumeAt = new Date("2026-09-04T10:15:30.000Z");
    const resumed = resolveWorkShiftTransition({ ...active, status: "paused", pausedAt: pauseAt }, "resume", resumeAt);
    expect(resumed.sessionPatch).toEqual({ status: "active", pausedAt: null, pausedSeconds: 930 });

    const endAt = new Date("2026-09-04T12:00:00.000Z");
    const ended = resolveWorkShiftTransition({ ...active, pausedSeconds: 930 }, "end", endAt);
    expect(ended.sessionPatch.workedSeconds).toBe(13470);
  });

  it("inclui a pausa corrente quando encerra uma sessão pausada", () => {
    const endAt = new Date("2026-09-04T12:00:00.000Z");
    const ended = resolveWorkShiftTransition({
      ...active,
      status: "paused",
      pausedAt: new Date("2026-09-04T11:45:00.000Z"),
      pausedSeconds: 300,
    }, "end", endAt);
    expect(ended.sessionPatch.pausedSeconds).toBe(1200);
    expect(ended.sessionPatch.workedSeconds).toBe(13200);
  });

  it("rejeita transições incompatíveis", () => {
    expect(() => resolveWorkShiftTransition(null, "pause", startAt)).toThrow("Inicie a jornada");
    expect(() => resolveWorkShiftTransition(active, "start", startAt)).toThrow("já está em andamento");
    expect(() => resolveWorkShiftTransition(active, "resume", startAt)).toThrow("não está em pausa");
  });
});
