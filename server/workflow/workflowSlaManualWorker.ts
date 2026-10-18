import { randomUUID } from "node:crypto";
import { WorkflowSlaDeliveryConflictError } from "./workflowSlaDeliveryCoordinator";
import type { createWorkflowSlaDeliveryCoordinator } from "./workflowSlaDeliveryCoordinator";

export type WorkflowSlaManualCandidateSource = {
  listDueIntentIds(input: {
    organizationId: number;
    now: string;
    limit: number;
  }): Promise<number[]>;
};
type Coordinator = ReturnType<typeof createWorkflowSlaDeliveryCoordinator>;

export type WorkflowSlaManualBatchResult = {
  mode: "preview" | "lease_probe";
  organizationId: number;
  scanned: number;
  candidateIds: number[];
  leased: number;
  contention: number;
  skipped: number;
  // Leases remain active until their expiration; no receipt is emitted.
  // A future worker with a delivery adapter must handle settlement explicitly.
};

export function validateWorkflowSlaManualBatchInput(input: {
  organizationId: number;
  now: string;
  limit: number;
  workerId: string;
  mode: "preview" | "lease_probe";
  operatorApproved: boolean;
}) {
  if (!Number.isSafeInteger(input.organizationId) || input.organizationId < 1) {
    throw new Error("organizationId inválido.");
  }
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 20) {
    throw new Error("Limite manual deve estar entre 1 e 20.");
  }
  if (typeof input.now !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.now)
    || !Number.isFinite(Date.parse(input.now))
    || new Date(Date.parse(input.now)).toISOString() !== input.now) {
    throw new Error("now deve ser UTC ISO-8601 válido com milissegundos.");
  }
  if (typeof input.workerId !== "string"
    || input.workerId.trim() !== input.workerId
    || input.workerId.length < 1 || input.workerId.length > 120) {
    throw new Error("workerId inválido.");
  }
  if (input.mode !== "preview" && input.mode !== "lease_probe") {
    throw new Error("Modo manual SLA desconhecido.");
  }
  if (input.operatorApproved !== true) {
    throw new Error("Aprovação do operador de homologação não registrada.");
  }
  // Defense-in-depth for an invocation that has no HTTP, CLI or cron entrypoint.
  // operatorApproved is not an RBAC substitute: any later entrypoint must
  // authenticate and authorize an operational administrator for the tenant.
  if (process.env.AXE_RUNTIME_ENV !== "homologation"
    || process.env.AXE_SLA_I5C_ENABLED !== "true") {
    throw new Error("Worker SLA desabilitado fora da homologação autorizada.");
  }
}

export function createWorkflowSlaManualWorker(deps: {
  candidates: WorkflowSlaManualCandidateSource;
  coordinator: Coordinator;
  tokenFactory?: () => string;
}) {
  const tokenFactory = deps.tokenFactory ?? randomUUID;
  return {
    /**
     * Manual, bounded worker. 'preview' is read-only. 'lease_probe' creates
     * real lease records in homologation only, with no external delivery,
     * success acknowledgment, auto-reassignment or incident mutation.
     * Conflict is expected for another worker winning the same CAS.
     */
    async run(input: {
      organizationId: number;
      now: string;
      limit: number;
      workerId: string;
      mode: "preview" | "lease_probe";
      operatorApproved: boolean;
    }): Promise<WorkflowSlaManualBatchResult> {
      validateWorkflowSlaManualBatchInput(input);
      const ids = await deps.candidates.listDueIntentIds({
        organizationId: input.organizationId, now: input.now, limit: input.limit,
      });
      if (!Array.isArray(ids) || ids.length > input.limit
        || ids.some(id => !Number.isSafeInteger(id) || id < 1)
        || new Set(ids).size !== ids.length) {
        throw new Error("Consulta SLA retornou candidatos inválidos ou duplicados.");
      }

      const result: WorkflowSlaManualBatchResult = {
        mode: input.mode, organizationId: input.organizationId,
        scanned: ids.length, candidateIds: ids,
        leased: 0, contention: 0, skipped: 0,
      };
      if (input.mode === "preview") return result;

      for (const intentId of ids) {
        // Re-check the manual gate before EACH write, including a feature
        // flag disabled while the batch is running.
        validateWorkflowSlaManualBatchInput(input);
        const leaseToken = tokenFactory();
        if (typeof leaseToken !== "string" || !leaseToken.trim()
          || leaseToken.trim() !== leaseToken || leaseToken.length > 160) {
          throw new Error("Gerador de token de lease inválido.");
        }
        try {
          const transition = await deps.coordinator.transition({
            intentId,
            action: {
              type: "claim", organizationId: input.organizationId,
              now: input.now, workerId: input.workerId, leaseToken,
            },
          });
          if (transition.outcome === "claimed") result.leased += 1;
          else if (transition.outcome === "dead_lettered") {
            // At max attempts, the domain may quarantine an intent;
            // it has NOT been sent externally.
            result.skipped += 1;
          } else result.skipped += 1;
        } catch (error) {
          if (error instanceof WorkflowSlaDeliveryConflictError) {
            result.contention += 1;
            continue;
          }
          // Stop rather than suppressing network/DB/auth failures.
          throw error;
        }
      }
      // Intentionally never return lease tokens in the result.
      return result;
    },
  };
}
