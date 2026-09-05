import { desc, eq } from "drizzle-orm";
import { workShiftAdjustments } from "../drizzle/workShiftAdjustmentSchema";
import { workShiftEvents, workShiftSessions } from "../drizzle/workShiftSchema";
import type {
  WorkShiftAdjustmentRecord,
  WorkShiftAdjustmentSnapshot,
} from "../shared/workShiftAdjustments";

export type WorkShiftAdjustmentDbExecutor = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  transaction?: <T>(callback: (tx: WorkShiftAdjustmentDbExecutor) => Promise<T>) => Promise<T>;
};

function asDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function hydrateSnapshot(row: any): WorkShiftAdjustmentSnapshot {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    teamId: row.teamId === null ? null : Number(row.teamId),
    scheduleAssignmentId: row.scheduleAssignmentId === null ? null : Number(row.scheduleAssignmentId),
    scheduledStartAt: asDate(row.scheduledStartAt),
    scheduledEndAt: asDate(row.scheduledEndAt),
    startedAt: asDate(row.startedAt)!,
    pausedAt: asDate(row.pausedAt),
    endedAt: asDate(row.endedAt),
    status: row.status,
    pausedSeconds: Number(row.pausedSeconds ?? 0),
    workedSeconds: Number(row.workedSeconds ?? 0),
    overtimeSeconds: Number(row.overtimeSeconds ?? 0),
    lateStartSeconds: Number(row.lateStartSeconds ?? 0),
    earlyEndSeconds: Number(row.earlyEndSeconds ?? 0),
  };
}

function hydrateStoredSnapshot(value: any): WorkShiftAdjustmentSnapshot {
  return {
    ...value,
    scheduledStartAt: asDate(value.scheduledStartAt),
    scheduledEndAt: asDate(value.scheduledEndAt),
    startedAt: asDate(value.startedAt)!,
    pausedAt: asDate(value.pausedAt),
    endedAt: asDate(value.endedAt),
  };
}

function hydrateRecord(row: any): WorkShiftAdjustmentRecord {
  return {
    id: Number(row.id),
    sessionId: Number(row.sessionId),
    requestedByUserId: Number(row.requestedByUserId),
    decidedByUserId: row.decidedByUserId === null ? null : Number(row.decidedByUserId),
    status: row.status,
    reason: row.reason,
    decisionReason: row.decisionReason ?? null,
    requestedChanges: row.requestedChanges ?? {},
    beforeSnapshot: hydrateStoredSnapshot(row.beforeSnapshot),
    afterSnapshot: row.afterSnapshot ? hydrateStoredSnapshot(row.afterSnapshot) : null,
    requestedAt: asDate(row.requestedAt)!,
    decidedAt: asDate(row.decidedAt),
    appliedAt: asDate(row.appliedAt),
  };
}

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export function createWorkShiftAdjustmentDbStore(db: WorkShiftAdjustmentDbExecutor) {
  async function inTransaction<T>(callback: (tx: WorkShiftAdjustmentDbExecutor) => Promise<T>) {
    return db.transaction ? db.transaction(callback) : callback(db);
  }

  return {
    async getSessionSnapshot(sessionId: number) {
      const row = (
        await db.select().from(workShiftSessions).where(eq(workShiftSessions.id, sessionId)).limit(1)
      )[0];
      return row ? hydrateSnapshot(row) : null;
    },

    async createAdjustment(record: WorkShiftAdjustmentRecord) {
      const [createdId] = await db.insert(workShiftAdjustments).values({
        sessionId: record.sessionId,
        requestedByUserId: record.requestedByUserId,
        decidedByUserId: record.decidedByUserId,
        status: record.status,
        reason: record.reason,
        decisionReason: record.decisionReason,
        requestedChanges: jsonSafe(record.requestedChanges),
        beforeSnapshot: jsonSafe(record.beforeSnapshot),
        afterSnapshot: null,
        requestedAt: record.requestedAt,
        decidedAt: null,
        appliedAt: null,
      }).$returningId();
      if (!createdId) throw new Error("Falha ao persistir ajuste de jornada.");
      return { ...record, id: createdId.id };
    },

    async getAdjustmentById(adjustmentId: number) {
      const row = (
        await db.select().from(workShiftAdjustments).where(eq(workShiftAdjustments.id, adjustmentId)).limit(1)
      )[0];
      return row ? hydrateRecord(row) : null;
    },

    async listAdjustments(input: { sessionId?: number; status?: "pending" | "approved" | "rejected" } = {}) {
      let query: any = db.select().from(workShiftAdjustments);
      if (input.sessionId !== undefined) query = query.where(eq(workShiftAdjustments.sessionId, input.sessionId));
      else if (input.status !== undefined) query = query.where(eq(workShiftAdjustments.status, input.status));
      return (await query.orderBy(desc(workShiftAdjustments.requestedAt))).map(hydrateRecord);
    },

    async approveAdjustment(record: WorkShiftAdjustmentRecord) {
      if (!record.id || !record.afterSnapshot) throw new Error("Ajuste aprovado inválido.");
      const adjustmentId = record.id;
      const after = record.afterSnapshot;
      return inTransaction(async tx => {
        await tx.update(workShiftSessions).set({
          teamId: after.teamId,
          startedAt: after.startedAt,
          endedAt: after.endedAt,
          status: after.status,
          pausedSeconds: after.pausedSeconds,
          workedSeconds: after.workedSeconds,
          overtimeSeconds: after.overtimeSeconds,
          lateStartSeconds: after.lateStartSeconds,
          earlyEndSeconds: after.earlyEndSeconds,
        }).where(eq(workShiftSessions.id, record.sessionId));

        await tx.update(workShiftAdjustments).set({
          decidedByUserId: record.decidedByUserId,
          status: "approved",
          afterSnapshot: jsonSafe(after),
          decidedAt: record.decidedAt,
          appliedAt: record.appliedAt,
        }).where(eq(workShiftAdjustments.id, adjustmentId));

        await tx.insert(workShiftEvents).values([
          {
            sessionId: record.sessionId,
            eventType: "adjustment_approved",
            occurredAt: record.decidedAt ?? new Date(),
            actorUserId: record.decidedByUserId,
            reason: record.reason,
            beforeData: jsonSafe(record.beforeSnapshot),
            afterData: jsonSafe(after),
            metadata: { adjustmentId },
          },
          {
            sessionId: record.sessionId,
            eventType: "adjusted",
            occurredAt: record.appliedAt ?? record.decidedAt ?? new Date(),
            actorUserId: record.decidedByUserId,
            reason: record.reason,
            beforeData: jsonSafe(record.beforeSnapshot),
            afterData: jsonSafe(after),
            metadata: { adjustmentId },
          },
        ]);
        return record;
      });
    },

    async rejectAdjustment(record: WorkShiftAdjustmentRecord) {
      if (!record.id) throw new Error("Ajuste rejeitado inválido.");
      const adjustmentId = record.id;
      return inTransaction(async tx => {
        await tx.update(workShiftAdjustments).set({
          decidedByUserId: record.decidedByUserId,
          status: "rejected",
          decisionReason: record.decisionReason,
          decidedAt: record.decidedAt,
        }).where(eq(workShiftAdjustments.id, adjustmentId));
        await tx.insert(workShiftEvents).values({
          sessionId: record.sessionId,
          eventType: "adjustment_rejected",
          occurredAt: record.decidedAt ?? new Date(),
          actorUserId: record.decidedByUserId,
          reason: record.decisionReason,
          beforeData: jsonSafe(record.beforeSnapshot),
          afterData: null,
          metadata: { adjustmentId },
        });
        return record;
      });
    },
  };
}
