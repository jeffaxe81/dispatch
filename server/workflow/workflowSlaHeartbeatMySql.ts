import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../dbLegacy";
import { auditLogs } from "../../drizzle/schema";
import { workflowSlaComponentHeartbeats as heartbeat } from "./workflowSlaHeartbeatSchema";
import { SLA_HEARTBEAT_MAX_AGE_MS, type SlaHeartbeatStore } from "./workflowSlaSignedHeartbeat";

type WorkflowDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;

/**
 * Durable cross-process replay protection for a single authoritative source
 * per tenant + component. SELECT ... FOR UPDATE serializes updates of existing
 * records; a unique composite primary key rejects concurrent first inserts.
 * Caller treats any DB conflict as fail-closed and must retry with a NEW seq.
 */
export type SlaFailoverStore = SlaHeartbeatStore & {
  promote(input: {
    organizationId: number;
    component: "scheduler" | "adapter";
    expectedSourceId: string;
    nextSourceId: string;
    nowMs: number;
    audit?: { actorUserId: number; approverUserId: number; approvalRef: string };
  }): Promise<boolean>;
};

export function createSlaHeartbeatMySqlStore(db: WorkflowDb): SlaFailoverStore {
  return {
    /**
     * J6F manual failover. A locked row is the authority for ownership: a
     * different source can never be promoted based on a stale pre-read.
     * A healthy, fresh source cannot be preempted by this manual operation.
     * On success clear all prior health evidence and reset sequence for the
     * new source; a NEW, authenticated heartbeat is required for readiness.
     */
    async promote(input) {
      if (!Number.isSafeInteger(input.organizationId) || input.organizationId < 1 ||
        !["scheduler", "adapter"].includes(input.component) ||
        typeof input.expectedSourceId !== "string" ||
        typeof input.nextSourceId !== "string" ||
        !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(input.expectedSourceId) ||
        !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(input.nextSourceId) ||
        input.expectedSourceId === input.nextSourceId ||
        !Number.isSafeInteger(input.nowMs) || input.nowMs < 0) {
        throw new Error("Transferência SLA inválida.");
      }
      if (input.audit && (
        !Number.isSafeInteger(input.audit.actorUserId) || input.audit.actorUserId < 1 ||
        !Number.isSafeInteger(input.audit.approverUserId) || input.audit.approverUserId < 1 ||
        input.audit.approverUserId === input.audit.actorUserId ||
        !/^[a-f0-9]{64}$/.test(input.audit.approvalRef)
      )) throw new Error("Evidência de aprovação SLA inválida.");
      return db.transaction(async tx => {
        const key = and(
          eq(heartbeat.organizationId, input.organizationId),
          eq(heartbeat.component, input.component),
        );
        const existing = (await tx.select().from(heartbeat)
          .where(key).limit(1).for("update"))[0];
        if (!existing || existing.sourceId !== input.expectedSourceId ||
          !Number.isSafeInteger(existing.sentAtMs) ||
          !Number.isSafeInteger(existing.receivedAtMs) ||
          existing.sentAtMs > input.nowMs ||
          existing.receivedAtMs > input.nowMs ||
          existing.sentAtMs > existing.receivedAtMs ||
          (existing.state !== "unhealthy" &&
            input.nowMs - existing.sentAtMs <= SLA_HEARTBEAT_MAX_AGE_MS)) {
          return false;
        }
        await tx.update(heartbeat).set({
          sourceId: input.nextSourceId,
          // Sequence starts again only after the previous source is fenced.
          sequence: 0,
          state: "unhealthy",
          sentAtMs: 0,
          receivedAtMs: input.nowMs,
        }).where(key);
        if (input.audit) {
          // Audit and authority handoff share a SINGLE transaction: audit
          // failure rolls the new owner back. Never persist HMACs, source
          // topology identifiers or signing keys in plaintext audit payload.
          const digest = (value: string) =>
            createHash("sha256").update(value, "utf8").digest("hex");
          await tx.insert(auditLogs).values({
            resourceType: "workflow_sla_heartbeat",
            resourceId: input.organizationId,
            action: "manual_failover_fenced",
            actorUserId: input.audit.actorUserId,
            beforeData: {
              component: input.component,
              sourceDigest: digest(input.expectedSourceId),
            },
            afterData: {
              component: input.component,
              sourceDigest: digest(input.nextSourceId),
              approverUserId: input.audit.approverUserId,
              approvalRef: input.audit.approvalRef,
              previousHealthInvalidated: true,
            },
          });
        }
        return true;
      });
    },
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
