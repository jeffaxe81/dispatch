import { describe, expect, it } from "vitest";
import { createWorkShiftScheduleService, type WorkShiftScheduleStore } from "./workShiftScheduleService";

const schedule = {
  id: 10,
  code: "PLANTAO-12X36-A",
  name: "Plantão A",
  organizationId: 1,
  organizationalUnitId: null,
  scheduleType: "cyclic_12x36" as const,
  timezone: "America/Sao_Paulo",
  startTimeLocal: "08:00",
  weekdays: null,
  plannedDurationMinutes: 720,
  breakPolicyMinutes: null,
  cycleAnchorAt: new Date("2026-09-04T11:00:00.000Z"),
  cycleWorkMinutes: 720,
  cycleRestMinutes: 2160,
  effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  effectiveUntil: null,
  active: true,
};

function createMemoryStore(): WorkShiftScheduleStore {
  const assignments: any[] = [];
  const exceptions: any[] = [];

  return {
    async findAssignmentsForUser(userId, from, until) {
      return assignments.filter(item => item.userId === userId && item.active && item.effectiveFrom < until && (item.effectiveUntil === null || item.effectiveUntil > from));
    },
    async findEffectiveAssignment(userId, instant) {
      return assignments.find(item => item.userId === userId && item.active && item.effectiveFrom <= instant && (item.effectiveUntil === null || item.effectiveUntil > instant)) ?? null;
    },
    async findAssignmentById(assignmentId) {
      return assignments.find(item => item.id === assignmentId) ?? null;
    },
    async findScheduleById(scheduleId) {
      return scheduleId === schedule.id ? schedule : null;
    },
    async findExceptions(assignmentId, from, until) {
      return exceptions.filter(item => item.assignmentId === assignmentId && item.startsAt < until && item.endsAt > from);
    },
    async insertAssignment(input) {
      const created = { id: assignments.length + 1, active: true, ...input };
      assignments.push(created);
      return created;
    },
    async insertException(input) {
      const created = { id: exceptions.length + 1, createdAt: new Date("2026-09-04T00:00:00.000Z"), ...input };
      exceptions.push(created);
      return created;
    },
  };
}

describe("work shift schedule service", () => {
  it("cria associação e rejeita sobreposição ativa para o mesmo usuário", async () => {
    const service = createWorkShiftScheduleService(createMemoryStore());
    const actor = { userId: 1, organizationId: 1, organizationalUnitId: null, permissions: ["*"] };

    await expect(service.createAssignment({
      scheduleId: 10,
      userId: 7,
      teamId: 3,
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveUntil: null,
    }, actor)).resolves.toMatchObject({ userId: 7 });

    await expect(service.createAssignment({
      scheduleId: 10,
      userId: 7,
      teamId: 4,
      effectiveFrom: new Date("2026-09-10T00:00:00.000Z"),
      effectiveUntil: null,
    }, actor)).rejects.toMatchObject({ code: "WORK_SHIFT_ASSIGNMENT_OVERLAP" });
  });

  it("resolve planejamento do usuário com precedência de exceção", async () => {
    const store = createMemoryStore();
    const service = createWorkShiftScheduleService(store);
    const actor = { userId: 1, organizationId: 1, organizationalUnitId: null, permissions: ["*"] };

    const assignment = await service.createAssignment({
      scheduleId: 10,
      userId: 7,
      teamId: 3,
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveUntil: null,
    }, actor);

    await service.createException({
      assignmentId: assignment.id,
      exceptionType: "replacement_shift",
      startsAt: new Date("2026-09-04T12:00:00.000Z"),
      endsAt: new Date("2026-09-04T20:00:00.000Z"),
      reason: "Troca autorizada",
    }, actor);

    await expect(service.resolveForUser(7, new Date("2026-09-04T14:00:00.000Z"))).resolves.toEqual({
      assignmentId: assignment.id,
      scheduleId: 10,
      plannedStartAt: new Date("2026-09-04T12:00:00.000Z"),
      plannedEndAt: new Date("2026-09-04T20:00:00.000Z"),
      inPlannedWindow: true,
      source: "exception",
    });
  });

  it("rejeita exceção com intervalo inválido", async () => {
    const store = createMemoryStore();
    const service = createWorkShiftScheduleService(store);
    const actor = { userId: 1, organizationId: 1, organizationalUnitId: null, permissions: ["*"] };
    const assignment = await service.createAssignment({
      scheduleId: 10,
      userId: 7,
      teamId: null,
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveUntil: null,
    }, actor);

    await expect(service.createException({
      assignmentId: assignment.id,
      exceptionType: "day_off",
      startsAt: new Date("2026-09-04T20:00:00.000Z"),
      endsAt: new Date("2026-09-04T12:00:00.000Z"),
      reason: "Inválida",
    }, actor)).rejects.toThrow("startsAt");
  });

  it("rejeita exceção criada fora do escopo organizacional da escala", async () => {
    const store = createMemoryStore();
    const service = createWorkShiftScheduleService(store);
    const admin = { userId: 1, organizationId: 1, organizationalUnitId: null, permissions: ["*"] };
    const assignment = await service.createAssignment({
      scheduleId: 10,
      userId: 7,
      teamId: 3,
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveUntil: null,
    }, admin);

    const outOfScopeActor = {
      userId: 2,
      organizationId: 2,
      organizationalUnitId: null,
      permissions: ["work_shift_schedules.manage"],
    };

    await expect(service.createException({
      assignmentId: assignment.id,
      exceptionType: "day_off",
      startsAt: new Date("2026-09-05T00:00:00.000Z"),
      endsAt: new Date("2026-09-06T00:00:00.000Z"),
      reason: "Fora do escopo",
    }, outOfScopeActor)).rejects.toThrow("Escala fora do escopo organizacional autorizado.");
  });
});
