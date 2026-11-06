/**
 * Read-only triage of durable evidence upload reservations.
 * Never infer that an external blob can be deleted based on the ledger alone.
 */
export type EvidenceRecoveryState = "reserved" | "committed" | "cleanup_required";
export type EvidenceRecoveryReason =
  | "cleanup_pending_review"
  | "stale_upload_reservation"
  | "missing_evidence_reference";

export const EVIDENCE_RESERVATION_STALE_MINUTES = 15;

export function evidenceRecoveryReason(input: {
  state: EvidenceRecoveryState;
  updatedAt: Date;
  hasEvidenceReference: boolean;
  now: Date;
}): EvidenceRecoveryReason | null {
  if (input.state === "cleanup_required") return "cleanup_pending_review";
  if (input.state === "reserved") {
    const cutoff = input.now.getTime() - EVIDENCE_RESERVATION_STALE_MINUTES * 60_000;
    return input.updatedAt.getTime() < cutoff ? "stale_upload_reservation" : null;
  }
  return !input.hasEvidenceReference ? "missing_evidence_reference" : null;
}
