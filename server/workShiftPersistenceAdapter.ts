import { eq } from "drizzle-orm";
import { auditLogs } from "../drizzle/schema";
import { workShiftEvents, workShiftSessions } from "../drizzle/workShiftSchema";
import type { buildWorkShiftPersistencePlan } from "./workShiftPersistencePlan";

type PersistencePlan = ReturnType<typeof buildWorkShiftPersistencePlan>;

type DrizzleLikeTransaction = {
  update: (table: unknown) => {
    set: (value: unknown) => {
      where: (condition: unknown) => Promise<unknown>;
    };
  };
  insert: (table: unknown) => {
    values: (value: unknown) => Promise<unknown>;
  };
};

type DrizzleLikeDb = {
  transaction: <T>(callback: (tx: DrizzleLikeTransaction) => Promise<T>) => Promise<T>;
};

export function createWorkShiftPersistenceAdapter(db: DrizzleLikeDb, sessionId: number) {
  return {
    transaction: async <T>(
      callback: (tx: {
        updateSession: (patch: PersistencePlan["sessionPatch"]) => Promise<unknown>;
        insertEvent: (event: PersistencePlan["event"]) => Promise<unknown>;
        insertAudit: (audit: PersistencePlan["audit"]) => Promise<unknown>;
      }) => Promise<T>,
    ) =>
      db.transaction(async tx =>
        callback({
          updateSession: patch =>
            tx.update(workShiftSessions).set(patch).where(eq(workShiftSessions.id, sessionId)),
          insertEvent: event => tx.insert(workShiftEvents).values(event),
          insertAudit: audit => tx.insert(auditLogs).values(audit),
        }),
      ),
  };
}
