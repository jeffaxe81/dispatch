import { and, desc, eq, inArray } from "drizzle-orm";
import { auditLogs, teams } from "../drizzle/schema";
import { operationalPresence, workSessionEvents, workSessions } from "../drizzle/schema.cp016";
import { getDb } from "./db";
import { executeCp016ShiftPersistence, type Cp016ShiftPersistenceAdapter } from "./cp016ShiftPersistence";
import type { WorkSessionAction } from "./workSessionState";

export async function updateTeamShiftCp016(input: {
  teamId: number;
  action: WorkSessionAction;
  actorUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  return db.transaction(async tx => {
    const adapter: Cp016ShiftPersistenceAdapter = {
      async getTeamSnapshot(teamId) {
        const row = (await tx.select().from(teams).where(eq(teams.id, teamId)).limit(1))[0];
        if (!row) return null;
        return {
          id: row.id,
          shiftStartedAt: row.shiftStartedAt,
          shiftPausedAt: row.shiftPausedAt,
          shiftEndsAt: row.shiftEndsAt,
          shiftPausedTotalSeconds: row.shiftPausedTotalSeconds,
          status: row.status,
        };
      },

      async getActiveSession(teamId) {
        const row = (
          await tx
            .select()
            .from(workSessions)
            .where(and(eq(workSessions.teamId, teamId), inArray(workSessions.status, ["open", "paused"])))
            .orderBy(desc(workSessions.startedAt))
            .limit(1)
        )[0];
        if (!row) return null;
        return {
          id: row.id,
          startedAt: row.startedAt,
          pausedAt: row.pausedAt,
          endedAt: row.endedAt,
          totalPauseSeconds: row.totalPauseSeconds,
          status: row.status,
        };
      },

      async updateTeamSnapshot(teamId, patch) {
        await tx.update(teams).set(patch).where(eq(teams.id, teamId));
      },

      async createSession(values) {
        const [record] = await tx.insert(workSessions).values(values).$returningId();
        return record.id;
      },

      async updateSession(sessionId, patch) {
        await tx.update(workSessions).set(patch).where(eq(workSessions.id, sessionId));
      },

      async appendSessionEvent(values) {
        await tx.insert(workSessionEvents).values(values);
      },

      async upsertPresence(values) {
        await tx
          .insert(operationalPresence)
          .values(values)
          .onDuplicateKeyUpdate({
            set: {
              userId: values.userId,
              workSessionId: values.workSessionId,
              status: values.status,
              availableForDispatch: values.availableForDispatch,
              lastStatusAt: values.lastStatusAt,
            },
          });
      },

      async appendAuditLog(values) {
        await tx.insert(auditLogs).values(values);
      },
    };

    return executeCp016ShiftPersistence(input, adapter);
  });
}
