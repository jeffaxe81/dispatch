import { desc, eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { workShiftSessions } from "../drizzle/workShiftSchema";
import type { DispatchEligibilityRuntimeDependencies } from "./dispatchEligibilityRuntime";
import type { DispatchMemberPlanningSnapshot } from "./dispatchEligibilityService";
import { createWorkShiftScheduleDbStore } from "./workShiftScheduleDbStore";
import { createWorkShiftScheduleService } from "./workShiftScheduleService";

type DispatchEligibilityDbExecutor = {
  select: (...args: any[]) => any;
  insert?: (...args: any[]) => any;
};

function activeExceptionAt(
  exceptions: Array<{ exceptionType: string; startsAt: Date; endsAt: Date }>,
  instant: Date,
) {
  return exceptions.find(exception => exception.startsAt <= instant && exception.endsAt > instant) ?? null;
}

export function createDispatchEligibilityDbDependencies(
  db: DispatchEligibilityDbExecutor,
): DispatchEligibilityRuntimeDependencies {
  const store = createWorkShiftScheduleDbStore(db as never);
  const scheduleService = createWorkShiftScheduleService(store);

  return {
    async loadTeamMembers(teamId) {
      return db
        .select({ userId: users.id, teamId: users.teamId, active: users.active })
        .from(users)
        .where(eq(users.teamId, teamId))
        .orderBy(users.id);
    },

    async loadCurrentSession(userId) {
      const row = (
        await db
          .select({ id: workShiftSessions.id, status: workShiftSessions.status })
          .from(workShiftSessions)
          .where(eq(workShiftSessions.userId, userId))
          .orderBy(desc(workShiftSessions.startedAt))
          .limit(1)
      )[0];

      if (!row || row.status === "cancelled") return null;
      return { id: row.id, status: row.status };
    },

    async resolvePlanning(userId, instant): Promise<DispatchMemberPlanningSnapshot | null> {
      if (Number.isNaN(instant.getTime())) throw new Error("instant inválido");

      const assignment = await store.findEffectiveAssignment(userId, instant);
      if (!assignment) return null;

      const epsilon = 1;
      const exceptions = await store.findExceptions(
        assignment.id,
        new Date(instant.getTime() - epsilon),
        new Date(instant.getTime() + epsilon),
      );
      const currentException = activeExceptionAt(exceptions, instant);

      if (currentException?.exceptionType === "day_off") return { kind: "day_off" };
      if (currentException?.exceptionType === "leave") return { kind: "leave" };

      const resolved = await scheduleService.resolveForUser(userId, instant);
      if (!resolved) return null;

      const source = currentException?.exceptionType === "replacement_shift"
        ? "replacement_shift"
        : currentException?.exceptionType === "extra_call"
          ? "extra_call"
          : "schedule";

      return {
        kind: "work",
        inPlannedWindow: resolved.inPlannedWindow,
        plannedStartAt: resolved.plannedStartAt,
        plannedEndAt: resolved.plannedEndAt,
        source,
      };
    },
  };
}
