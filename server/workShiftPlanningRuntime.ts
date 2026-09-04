import { eq } from "drizzle-orm";
import { workShiftSessions } from "../drizzle/workShiftSchema";
import { getDb } from "./db";
import { createWorkShiftScheduleDbStore } from "./workShiftScheduleDbStore";
import { createWorkShiftScheduleService, type ResolvedUserWorkShiftPlan } from "./workShiftScheduleService";

export type RuntimeWorkShiftPlanningSnapshot = {
  scheduleAssignmentId: number | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  lateStartSeconds: number;
  earlyEndSeconds: number;
  overtimeSeconds: number;
};

export async function resolveRuntimeWorkShiftPlan(
  userId: number,
  instant: Date,
): Promise<ResolvedUserWorkShiftPlan | null> {
  const db = await getDb();
  if (!db) return null;

  const service = createWorkShiftScheduleService(createWorkShiftScheduleDbStore(db));
  return service.resolveForUser(userId, instant);
}

export async function loadRuntimeWorkShiftPlanningSnapshot(
  sessionId: number,
): Promise<RuntimeWorkShiftPlanningSnapshot | null> {
  const db = await getDb();
  if (!db) return null;

  return (
    await db
      .select({
        scheduleAssignmentId: workShiftSessions.scheduleAssignmentId,
        scheduledStartAt: workShiftSessions.scheduledStartAt,
        scheduledEndAt: workShiftSessions.scheduledEndAt,
        lateStartSeconds: workShiftSessions.lateStartSeconds,
        earlyEndSeconds: workShiftSessions.earlyEndSeconds,
        overtimeSeconds: workShiftSessions.overtimeSeconds,
      })
      .from(workShiftSessions)
      .where(eq(workShiftSessions.id, sessionId))
      .limit(1)
  )[0] ?? null;
}
