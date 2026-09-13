import { and, desc, eq, inArray } from "drizzle-orm";
import { teams, users } from "../drizzle/schema";
import { workShiftEvents, workShiftSessions } from "../drizzle/workShiftSchema";
import type { WorkShiftAction } from "../shared/workShifts";
import { getDb } from "./dbLegacy";
import { executeOwnWorkShiftAction, type WorkShiftStore } from "./workShiftService";

export * from "./dbLegacy";

export async function controlOwnWorkShift(input: {
  userId: number;
  teamId: number | null;
  action: WorkShiftAction;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db.transaction(async tx => {
    const lockedUser = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1)
      .for("update");
    if (!lockedUser[0]) throw new Error("Usuário não encontrado.");

    const store: WorkShiftStore = {
      async getOpenSession(userId) {
        const row = (
          await tx
            .select({
              id: workShiftSessions.id,
              startedAt: workShiftSessions.startedAt,
              pausedAt: workShiftSessions.pausedAt,
              endedAt: workShiftSessions.endedAt,
              status: workShiftSessions.status,
              pausedSeconds: workShiftSessions.pausedSeconds,
            })
            .from(workShiftSessions)
            .where(and(eq(workShiftSessions.userId, userId), inArray(workShiftSessions.status, ["active", "paused"])))
            .orderBy(desc(workShiftSessions.startedAt))
            .limit(1)
        )[0];
        if (!row) return null;
        if (row.status !== "active" && row.status !== "paused") {
          throw new Error("Estado aberto de jornada inválido.");
        }
        return { ...row, status: row.status };
      },
      async createSession(values) {
        const [record] = await tx.insert(workShiftSessions).values(values).$returningId();
        if (!record) throw new Error("Falha ao criar sessão de jornada.");
        return { id: record.id };
      },
      async updateSession(sessionId, patch) {
        await tx.update(workShiftSessions).set(patch).where(eq(workShiftSessions.id, sessionId));
      },
      async appendEvent(event) {
        await tx.insert(workShiftEvents).values(event);
      },
      async mirrorTeam(teamId, patch) {
        await tx.update(teams).set(patch).where(eq(teams.id, teamId));
      },
    };

    return executeOwnWorkShiftAction(store, input);
  });
}

export { setSimulatedWorkflowActive } from "./workflow/workflowPersistence";
export { executeSimulatedWorkflow, retrySimulatedWorkflowExecution } from "./workflow/workflowExecutionPersistence";
export {
  advanceManualWorkflowInstance,
  cancelManualWorkflowInstance,
  resumeManualWorkflowInstanceFromCompletedTask,
  startManualWorkflowInstance,
} from "./workflow/workflowInstancePersistence";
export {
  assignWorkflowTask,
  claimWorkflowTask,
  completeWorkflowTask,
  startWorkflowTask,
} from "./workflow/workflowTaskPersistence";