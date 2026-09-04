import { describe, expect, it } from "vitest";
import { listWorkShiftCoverage } from "./workShiftCoverageService";

const schedule = {
  id: 10,
  code: "12X36-CENTRAL",
  name: "12x36 Central",
  organizationId: 1,
  organizationalUnitId: 2,
  scheduleType: "cyclic_12x36" as const,
  timezone: "America/Sao_Paulo",
  startTimeLocal: "08:00",
  weekdays: null,
  plannedDurationMinutes: 720,
  breakPolicyMinutes: 60,
  cycleAnchorAt: new Date("2026-09-04T11:00:00.000Z"),
  cycleWorkMinutes: 720,
  cycleRestMinutes: 2160,
  effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  effectiveUntil: null,
  active: true,
};

function assignment(id: number, userId: number) {
  return {
    id,
    scheduleId: schedule.id,
    userId,
    teamId: 3,
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveUntil: null,
    active: true,
    schedule,
  };
}

describe("listWorkShiftCoverage", () => {
  it("classifica realizado, em andamento e ausência de início pela janela planejada", () => {
    const plannedStartAt = new Date("2026-09-04T11:00:00.000Z");
    const plannedEndAt = new Date("2026-09-04T23:00:00.000Z");

    const rows = listWorkShiftCoverage({
      from: new Date("2026-09-04T00:00:00.000Z"),
      until: new Date("2026-09-05T00:00:00.000Z"),
      now: new Date("2026-09-04T22:00:00.000Z"),
      assignments: [assignment(100, 7), assignment(101, 8), assignment(102, 9)],
      exceptions: [],
      sessions: [
        {
          id: 501,
          userId: 7,
          scheduleAssignmentId: 100,
          scheduledStartAt: plannedStartAt,
          scheduledEndAt: plannedEndAt,
          startedAt: plannedStartAt,
          endedAt: new Date("2026-09-04T21:30:00.000Z"),
          status: "ended" as const,
        },
        {
          id: 502,
          userId: 8,
          scheduleAssignmentId: 101,
          scheduledStartAt: plannedStartAt,
          scheduledEndAt: plannedEndAt,
          startedAt: new Date("2026-09-04T11:05:00.000Z"),
          endedAt: null,
          status: "active" as const,
        },
      ],
    });

    expect(rows.map(row => [row.userId, row.status])).toEqual([
      [7, "completed"],
      [8, "in_progress"],
      [9, "missing_start"],
    ]);
    expect(rows[0]).toMatchObject({ assignmentId: 100, scheduleId: 10, teamId: 3, plannedStartAt, plannedEndAt, sessionId: 501 });
  });

  it("expande o ciclo 12x36 e não cria falta para dia de descanso", () => {
    const rows = listWorkShiftCoverage({
      from: new Date("2026-09-04T00:00:00.000Z"),
      until: new Date("2026-09-08T00:00:00.000Z"),
      now: new Date("2026-09-08T00:00:00.000Z"),
      assignments: [assignment(100, 7)],
      exceptions: [],
      sessions: [],
    });

    expect(rows.map(row => row.plannedStartAt.toISOString())).toEqual([
      "2026-09-04T11:00:00.000Z",
      "2026-09-06T11:00:00.000Z",
    ]);
    expect(rows.every(row => row.status === "missing_start")).toBe(true);
  });

  it("aplica day_off antes de classificar ausência como missing_start", () => {
    const rows = listWorkShiftCoverage({
      from: new Date("2026-09-04T00:00:00.000Z"),
      until: new Date("2026-09-05T00:00:00.000Z"),
      now: new Date("2026-09-05T00:00:00.000Z"),
      assignments: [assignment(100, 7)],
      exceptions: [
        {
          id: 900,
          assignmentId: 100,
          exceptionType: "day_off" as const,
          startsAt: new Date("2026-09-04T00:00:00.000Z"),
          endsAt: new Date("2026-09-05T00:00:00.000Z"),
        },
      ],
      sessions: [],
    });

    expect(rows).toEqual([]);
  });
});
