import { describe, expect, it, vi } from "vitest";
import { createDispatchEligibilityDbDependencies } from "./dispatchEligibilityDb";

function queuedDb(responses: unknown[][]) {
  const queue = [...responses];
  const select = vi.fn(() => {
    const rows = queue.shift() ?? [];
    const builder: any = {
      from: vi.fn(() => builder),
      where: vi.fn(() => builder),
      orderBy: vi.fn(() => builder),
      limit: vi.fn(async () => rows),
      then(resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return builder;
  });

  return { select };
}

const assignment = {
  id: 41,
  scheduleId: 7,
  userId: 110,
  teamId: 10,
  effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  effectiveUntil: null,
  active: true,
};

const schedule = {
  id: 7,
  code: "12X36-A",
  name: "Escala A",
  organizationId: 1,
  organizationalUnitId: null,
  scheduleType: "cyclic_12x36" as const,
  timezone: "UTC",
  startTimeLocal: "08:00",
  weekdays: null,
  plannedDurationMinutes: 720,
  breakPolicyMinutes: null,
  cycleAnchorAt: new Date("2026-09-05T08:00:00.000Z"),
  cycleWorkMinutes: 720,
  cycleRestMinutes: 2160,
  effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  effectiveUntil: null,
  active: true,
};

const instant = new Date("2026-09-05T12:00:00.000Z");

describe("D-007C dispatch eligibility Drizzle adapter", () => {
  it("carrega membros exclusivamente da equipe solicitada", async () => {
    const db = queuedDb([[
      { userId: 110, teamId: 10, active: true },
      { userId: 111, teamId: 10, active: false },
    ]]);
    const deps = createDispatchEligibilityDbDependencies(db as never);

    await expect(deps.loadTeamMembers(10)).resolves.toEqual([
      { userId: 110, teamId: 10, active: true },
      { userId: 111, teamId: 10, active: false },
    ]);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("carrega a sessão real mais recente da D-007A", async () => {
    const db = queuedDb([[
      { id: 501, status: "paused" },
    ]]);
    const deps = createDispatchEligibilityDbDependencies(db as never);

    await expect(deps.loadCurrentSession(110)).resolves.toEqual({ id: 501, status: "paused" });
  });

  it("preserva folga ativa como motivo específico antes de delegar o cálculo D-007B", async () => {
    const dayOff = {
      id: 91,
      assignmentId: 41,
      exceptionType: "day_off" as const,
      startsAt: new Date("2026-09-05T00:00:00.000Z"),
      endsAt: new Date("2026-09-06T00:00:00.000Z"),
      reason: "Folga",
      createdByUserId: 1,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    const db = queuedDb([[assignment], [dayOff]]);
    const deps = createDispatchEligibilityDbDependencies(db as never);

    await expect(deps.resolvePlanning(110, instant)).resolves.toEqual({ kind: "day_off" });
  });

  it("reutiliza o serviço D-007B para resolver a janela 12x36", async () => {
    const db = queuedDb([
      [assignment],
      [],
      [assignment],
      [schedule],
      [],
    ]);
    const deps = createDispatchEligibilityDbDependencies(db as never);

    await expect(deps.resolvePlanning(110, instant)).resolves.toEqual({
      kind: "work",
      inPlannedWindow: true,
      plannedStartAt: new Date("2026-09-05T08:00:00.000Z"),
      plannedEndAt: new Date("2026-09-05T20:00:00.000Z"),
      source: "schedule",
    });
  });

  it("retorna null quando não há associação D-007B efetiva", async () => {
    const db = queuedDb([[]]);
    const deps = createDispatchEligibilityDbDependencies(db as never);

    await expect(deps.resolvePlanning(110, instant)).resolves.toBeNull();
  });
});
