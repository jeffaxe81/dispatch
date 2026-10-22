import { and, eq } from "drizzle-orm";
import { getDb } from "../dbLegacy";
import { workflowSlaComponentHeartbeats as heartbeat } from "./workflowSlaHeartbeatSchema";
import type { SlaHeartbeatStore } from "./workflowSlaSignedHeartbeat";

type WorkflowDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;

/**
 * Durable cross-process replay protection for a single authoritative source
 * per tenant + component. SELECT ... FOR UPDATE serializes updates of existing
 * records; a unique composite primary key rejects concurrent first inserts.
 * Caller treats any DB conflict as fail-closed and must retry with a NEW seq.
 */
export function createSlaHeartbeatMySqlStore(db: WorkflowDb): SlaHeartbeatStore {
  return {
    async accept(input) {
      if (!Number.isSafeInteger(input.organizationId) || input.organizationId < 1 ||
        !["scheduler", "adapter"].includes(input.component) ||
        !Number.isSafeInteger(input.sequence) || input.sequence < 1 ||
        !Number.isSafeInteger(input.sentAtMs) || input.sentAtMs < 0 ||
        !Number.isSafeInteger(input.receivedAtMs) || input.receivedAtMs < input.sentAtMs) {
        throw new Error("Heartbeat SLA inválido.");
      }
      return db.transaction(async tx => {
        const key = and(
          eq(heartbeat.organizationId, input.organizationId),
          eq(heartbeat.component, input.component),
        );
        const existing = (await tx.select().from(heartbeat)
          .where(key).limit(1).for("update"))[0];
        if (existing) {
          if (existing.sourceId !== input.sourceId ||
            input.sequence <= existing.sequence ||
            input.sentAtMs <= existing.sentAtMs ||
            input.receivedAtMs < existing.receivedAtMs) return false;
          await tx.update(heartbeat).set({
            sequence: input.sequence,
            state: input.state,
            sentAtMs: input.sentAtMs,
            receivedAtMs: input.receivedAtMs,
          }).where(key);
          return true;
        }
        await tx.insert(heartbeat).values(input);
        return true;
      });
    },
    async read(input) {
      if (!Number.isSafeInteger(input.organizationId) || input.organizationId < 1 ||
        !["scheduler", "adapter"].includes(input.component)) {
        throw new Error("Escopo SLA inválido.");
      }
      const found = (await db.select().from(heartbeat).where(and(
        eq(heartbeat.organizationId, input.organizationId),
        eq(heartbeat.component, input.component),
      )).limit(1))[0];
      return found ? {
        organizationId: found.organizationId,
        component: found.component,
        sourceId: found.sourceId,
        sequence: found.sequence,
        state: found.state,
        sentAtMs: found.sentAtMs,
        receivedAtMs: found.receivedAtMs,
      } : null;
    },
  };
}
