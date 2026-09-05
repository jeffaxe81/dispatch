import type { WorkShiftPendingStatus } from "./workShiftOperationsDomain";
import { transitionWorkShiftPending } from "./workShiftOperationsDomain";
import type { PendingRecord } from "./workShiftOperationsStore";

export type WorkShiftPendingHistoryEntry = {
  pendingId: number;
  tenantId: number;
  actorUserId: number;
  fromStatus: WorkShiftPendingStatus;
  toStatus: WorkShiftPendingStatus;
  justification: string;
  beforeData: unknown;
  afterData: unknown;
  createdAt: Date;
};

export type WorkShiftAdjustmentRequest = {
  tenantId: number;
  pendingId: number;
  actorUserId: number;
  expectedVersion: number;
  justification: string;
  resolution: "resolved" | "no_adjustment_required";
  adjustment?: unknown;
  now: Date;
};

export type WorkShiftOperationsResolutionDependencies = {
  getPending(tenantId: number, pendingId: number): Promise<PendingRecord | null>;
  applyJourneyAdjustment(input: WorkShiftAdjustmentRequest & { pending: PendingRecord }): Promise<unknown>;
  updatePendingVersioned(input: {
    tenantId: number;
    pendingId: number;
    expectedVersion: number;
    status: WorkShiftPendingStatus;
    justification: string;
    resolvedByUserId: number;
    resolvedAt: Date;
  }): Promise<PendingRecord | null>;
  appendPendingHistory(entry: WorkShiftPendingHistoryEntry): Promise<void>;
  refreshDispatchEligibility(input: { tenantId: number; userId: number; teamId: number | null }): Promise<void>;
};

export class WorkShiftPendingVersionConflictError extends Error {
  constructor() {
    super("work shift pending item changed concurrently");
    this.name = "WorkShiftPendingVersionConflictError";
  }
}

export function createWorkShiftOperationsResolution(deps: WorkShiftOperationsResolutionDependencies) {
  return {
    async resolve(input: WorkShiftAdjustmentRequest) {
      const current = await deps.getPending(input.tenantId, input.pendingId);
      if (!current || current.tenantId !== input.tenantId) return null;

      const transition = transitionWorkShiftPending(current.status, input.resolution, input.justification);
      const beforeData = current;
      const adjustmentResult = input.adjustment === undefined
        ? null
        : await deps.applyJourneyAdjustment({ ...input, pending: current });

      const updated = await deps.updatePendingVersioned({
        tenantId: input.tenantId,
        pendingId: input.pendingId,
        expectedVersion: input.expectedVersion,
        status: transition.status,
        justification: transition.justification ?? input.justification.trim(),
        resolvedByUserId: input.actorUserId,
        resolvedAt: input.now,
      });
      if (!updated) throw new WorkShiftPendingVersionConflictError();

      await deps.appendPendingHistory({
        pendingId: updated.id,
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        fromStatus: current.status,
        toStatus: updated.status,
        justification: transition.justification ?? input.justification.trim(),
        beforeData,
        afterData: { pending: updated, adjustmentResult },
        createdAt: input.now,
      });

      await deps.refreshDispatchEligibility({
        tenantId: input.tenantId,
        userId: current.userId,
        teamId: current.teamId,
      });

      return { pending: updated, adjustmentResult };
    },
  };
}
