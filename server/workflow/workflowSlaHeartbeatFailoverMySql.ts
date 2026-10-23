import { and, eq } from "drizzle-orm";
import { auditLogs } from "../../drizzle/schema";
import { getDb } from "../dbLegacy";
import { workflowSlaComponentHeartbeats as heartbeat } from "./workflowSlaHeartbeatSchema";
import {
  isSlaHeartbeatExpired,
  validateSlaHeartbeatHandover,
  type SlaHeartbeatHandoverStore,
} from "./workflowSlaHeartbeatFailover";

type WorkflowDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;

/**
 * Physical fencing:
 * - row lock serializes owner changes and old owner's beat acceptance;
 * - expected source + sequence form a compare-and-swap precondition;
 * - stale old evidence cannot be extended across failover;
 * - new owner begins UNHEALTHY, never inheriting old owner's ready state;
 * - an audit entry must commit in the SAME transaction as ownership.
 */
export function createSlaHeartbeatFailoverMySqlStore(db: WorkflowDb): SlaHeartbeatHandoverStore {
  return {
    async handover(input) {
      validateSlaHeartbeatHandover(input);
      return db.transaction(async tx => {
        const key = and(
          eq(heartbeat.organizationId, input.organizationId),
          eq(heartbeat.component, input.component),
        );
        const previous = (await tx.select().from(heartbeat)
          .where(key).limit(1).for("update"))[0];
        if (!previous ||
          previous.sourceId !== input.expectedSourceId ||
          previous.sequence !== input.expectedSequence ||
          !isSlaHeartbeatExpired(previous.sentAtMs, input.nowMs) ||
          !Number.isSafeInteger(previous.receivedAtMs) ||
          previous.receivedAtMs > input.nowMs ||
          previous.sequence >= Number.MAX_SAFE_INTEGER) return false;
        const nextSequence = previous.sequence + 1;
        // Fail closed: the just-promoted source is explicitly unhealthy until
        // it produces its own fresh, signed and accepted liveness proof.
        await tx.update(heartbeat).set({
          sourceId: input.nextSourceId,
          sequence: nextSequence,
          state: "unhealthy",
          sentAtMs: input.nowMs,
          receivedAtMs: input.nowMs,
        }).where(key);
        await tx.insert(auditLogs).values({
          resourceType: "workflow_sla_heartbeat",
          resourceId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "manual_source_handover",
          beforeData: {
            organizationId: input.organizationId,
            component: input.component,
            sourceId: previous.sourceId,
            sequence: previous.sequence,
            state: previous.state,
          },
          afterData: {
            organizationId: input.organizationId,
            component: input.component,
            sourceId: input.nextSourceId,
            sequence: nextSequence,
            state: "unhealthy",
            reason: input.reason,
          },
        });
        return true;
      });
    },
  };
}
