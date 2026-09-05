import type { WorkShiftAnomalyCandidate } from "./workShiftAnomalyService";
import type { PendingRecord } from "./workShiftOperationsStore";

export type WorkShiftInternalAlert = {
  kind: "anomaly" | "sla_escalation";
  tenantId: number;
  pendingId: number;
  severity: WorkShiftAnomalyCandidate["severity"];
  anomalyType: WorkShiftAnomalyCandidate["anomalyType"];
  level?: number;
};

export type WorkShiftEscalationCandidate = {
  pending: PendingRecord;
  level: number;
};

export type WorkShiftOperationsAlertingDependencies = {
  upsertPendingFromAnomaly(anomaly: WorkShiftAnomalyCandidate): Promise<PendingRecord>;
  publishInternalAlert(alert: WorkShiftInternalAlert): Promise<void>;
  publishExternalAlert(alert: WorkShiftInternalAlert): Promise<void>;
  listEscalationCandidates(input: { tenantId: number; now: Date }): Promise<WorkShiftEscalationCandidate[]>;
  markEscalationLevel(input: { tenantId: number; pendingId: number; level: number; now: Date }): Promise<boolean>;
};

export function createWorkShiftOperationsAlerting(deps: WorkShiftOperationsAlertingDependencies) {
  return {
    async processWorkShiftAnomaly(anomaly: WorkShiftAnomalyCandidate) {
      const pending = await deps.upsertPendingFromAnomaly(anomaly);
      const alert: WorkShiftInternalAlert = {
        kind: "anomaly",
        tenantId: pending.tenantId,
        pendingId: pending.id,
        severity: pending.severity,
        anomalyType: pending.anomalyType,
      };

      await deps.publishInternalAlert(alert);

      let externalDelivery: "delivered" | "failed" = "delivered";
      try {
        await deps.publishExternalAlert(alert);
      } catch {
        externalDelivery = "failed";
      }

      return { pending, externalDelivery };
    },

    async evaluatePendingEscalations(input: { tenantId: number; now: Date }) {
      const candidates = await deps.listEscalationCandidates(input);
      let published = 0;

      for (const candidate of candidates) {
        if (candidate.pending.tenantId !== input.tenantId) continue;

        const claimed = await deps.markEscalationLevel({
          tenantId: input.tenantId,
          pendingId: candidate.pending.id,
          level: candidate.level,
          now: input.now,
        });
        if (!claimed) continue;

        const alert: WorkShiftInternalAlert = {
          kind: "sla_escalation",
          tenantId: input.tenantId,
          pendingId: candidate.pending.id,
          severity: candidate.pending.severity,
          anomalyType: candidate.pending.anomalyType,
          level: candidate.level,
        };

        await deps.publishInternalAlert(alert);
        try {
          await deps.publishExternalAlert(alert);
        } catch {
          // External adapters are best-effort and never undo the internal operational state.
        }
        published += 1;
      }

      return { evaluated: candidates.length, published };
    },
  };
}
