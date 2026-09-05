import { describe, expect, it } from "vitest";
import { applyScheduleExceptions, resolvePlannedShift } from "./workShiftScheduleDomain";

const schedule12x36 = {
  scheduleType: "cyclic_12x36" as const,
  timezone: "America/Sao_Paulo",
  cycleAnchorAt: new Date("2026-09-04T11:00:00.000Z"),
  plannedDurationMinutes: 720,
  cycleWorkMinutes: 720,
  cycleRestMinutes: 2160,
  startTimeLocal: "08:00",
  weekdays: null,
};

describe("work shift schedule domain", () => {
  it("resolve uma escala 12x36 pela âncora temporal e não por alternância de datas", () => {
    expect(resolvePlannedShift(schedule12x36, new Date("2026-09-04T14:00:00.000Z"))).toEqual({
      inPlannedWindow: true,
      plannedStartAt: new Date("2026-09-04T11:00:00.000Z"),
      plannedEndAt: new Date("2026-09-04T23:00:00.000Z"),
      source: "schedule",
    });

    expect(resolvePlannedShift(schedule12x36, new Date("2026-09-05T14:00:00.000Z"))).toEqual({
      inPlannedWindow: false,
      plannedStartAt: null,
      plannedEndAt: null,
      source: "none",
    });

    expect(resolvePlannedShift(schedule12x36, new Date("2026-09-06T12:00:00.000Z"))).toEqual({
      inPlannedWindow: true,
      plannedStartAt: new Date("2026-09-06T11:00:00.000Z"),
      plannedEndAt: new Date("2026-09-06T23:00:00.000Z"),
      source: "schedule",
    });
  });

  it("resolve escala fixa em timezone explícito", () => {
    const fixed = {
      scheduleType: "fixed" as const,
      timezone: "America/Sao_Paulo",
      cycleAnchorAt: null,
      plannedDurationMinutes: 480,
      cycleWorkMinutes: null,
      cycleRestMinutes: null,
      startTimeLocal: "08:00",
      weekdays: [1, 2, 3, 4, 5],
    };

    expect(resolvePlannedShift(fixed, new Date("2026-09-04T14:00:00.000Z"))).toEqual({
      inPlannedWindow: true,
      plannedStartAt: new Date("2026-09-04T11:00:00.000Z"),
      plannedEndAt: new Date("2026-09-04T19:00:00.000Z"),
      source: "schedule",
    });

    expect(resolvePlannedShift(fixed, new Date("2026-09-05T14:00:00.000Z"))).toEqual({
      inPlannedWindow: false,
      plannedStartAt: null,
      plannedEndAt: null,
      source: "none",
    });
  });

  it("dá precedência às exceções sobre a regra recorrente", () => {
    const baseWindow = {
      inPlannedWindow: true,
      plannedStartAt: new Date("2026-09-04T11:00:00.000Z"),
      plannedEndAt: new Date("2026-09-04T23:00:00.000Z"),
      source: "schedule" as const,
    };

    const startsAt = new Date("2026-09-04T11:00:00.000Z");
    const endsAt = new Date("2026-09-04T23:00:00.000Z");

    expect(applyScheduleExceptions(baseWindow, [{ exceptionType: "day_off", startsAt, endsAt }])).toEqual({
      inPlannedWindow: false,
      plannedStartAt: null,
      plannedEndAt: null,
      source: "none",
    });

    const replacementStart = new Date("2026-09-04T12:00:00.000Z");
    const replacementEnd = new Date("2026-09-04T20:00:00.000Z");

    expect(applyScheduleExceptions(baseWindow, [{ exceptionType: "replacement_shift", startsAt: replacementStart, endsAt: replacementEnd }])).toEqual({
      inPlannedWindow: true,
      plannedStartAt: replacementStart,
      plannedEndAt: replacementEnd,
      source: "exception",
    });
  });

  it("rejeita configuração 12x36 inválida", () => {
    expect(() => resolvePlannedShift({ ...schedule12x36, cycleAnchorAt: null }, new Date())).toThrow("cycleAnchorAt");
    expect(() => resolvePlannedShift({ ...schedule12x36, cycleWorkMinutes: 600 }, new Date())).toThrow("720");
    expect(() => resolvePlannedShift({ ...schedule12x36, cycleRestMinutes: 1800 }, new Date())).toThrow("2160");
  });
});
