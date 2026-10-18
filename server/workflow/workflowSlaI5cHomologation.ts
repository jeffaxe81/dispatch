import { getDb } from "../dbLegacy";
import { createWorkflowSlaDeliveryCoordinator } from "./workflowSlaDeliveryCoordinator";
import { createWorkflowSlaMySqlDeliveryStorage } from "./workflowSlaDeliveryMySql";
import { createWorkflowSlaManualCandidateMySql } from "./workflowSlaManualCandidateMySql";
import {
  createWorkflowSlaManualWorker,
  validateWorkflowSlaManualBatchInput,
} from "./workflowSlaManualWorker";

/**
 * I5C manual composition root. Do not call from process startup, cron,
 * a public router, or an unauthenticated background job.
 *
 * The caller must first authenticate an authorized operational administrator
 * for organizationId and separately document approval of the dry-run session.
 * The boolean below represents that completed check; it is not authorization
 * by itself. No external publisher is attached.
 */
export async function runWorkflowSlaI5cHomologationBatch(input: {
  organizationId: number;
  limit: number;
  workerId: string;
  mode: "preview" | "lease_probe";
  operatorApproved: boolean;
}) {
  // Do not trust operator-supplied wall-clock values when reserving real rows.
  // The pure worker accepts an injected UTC instant for deterministic tests,
  // but this MySQL entrypoint always uses the server clock.
  const batch = { ...input, now: new Date().toISOString() };
  // Gate before opening a DB connection.
  validateWorkflowSlaManualBatchInput(batch);

  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para homologação I5C.");

  const coordinator = createWorkflowSlaDeliveryCoordinator(
    createWorkflowSlaMySqlDeliveryStorage(db),
    {
      maxAttempts: 3,
      leaseDurationMs: 60_000,
      baseRetryMs: 5_000,
      maxRetryMs: 30_000,
    },
  );
  return createWorkflowSlaManualWorker({
    candidates: createWorkflowSlaManualCandidateMySql(db),
    coordinator,
  }).run(batch);
}
