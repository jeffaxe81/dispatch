import { eq } from "drizzle-orm";
import { auditLogs } from "../drizzle/schema";
import { workShiftEvents, workShiftSessions } from "../drizzle/workShiftSchema";
import type { buildWorkShiftPersistencePlan } from "./workShiftPersistencePlan";

type PersistencePlan = ReturnType<typeof buildWorkShiftPersistencePlan>;

type DrizzleLikeDb = {
  transaction: <T>(callback: (tx: any) => Promise<T>) => Promise<T>;
};

export function createWorkShiftPersistenceAdapter(
  db: DrizzleLikeDb,
  initialSessionId: number | null,
) {
  return {
    transaction: async <T>(
      callback: (tx: {
        createSession: (input: { userId: number }) => Promise<number>;
        updateSession: (patch: PersistencePlan["sessionPatch"]) => Promise<unknown>;
        insertEvent: (event: PersistencePlan["event"]) => Promise<unknown>;
        insertAudit: (audit: PersistencePlan["audit"]) => Promise<unknown>;
      }) => Promise<T>,
    ) =>
      db.transaction(async tx => {
        let sessionId = initialSessionId;

        return callback({
          createSession: async ({ userId }) => {
            const [record] = await tx
              .insert(workShiftSessions)
              .values({ userId, state: "fora_jornada" })
              .$returningId();
            if (!record?.id) throw new Error("Falha ao criar sessão de jornada.");
            sessionId = record.id;
            return record.id;
          },
          updateSession: patch => {
            if (!sessionId) throw new Error("Sessão de jornada não resolvida.");
            return tx
              .update(workShiftSessions)
              .set({ ...patch, updatedAt: new Date() })
              .where(eq(workShiftSessions.id, sessionId));
          },
          insertEvent: event => tx.insert(workShiftEvents).values(event),
          insertAudit: audit => tx.insert(auditLogs).values(audit),
        });
      }),
  };
}
