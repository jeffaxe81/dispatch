import { describe, expect, it } from "vitest";
import {
  EVIDENCE_RESERVATION_STALE_MINUTES,
  evidenceRecoveryReason,
} from "./evidenceReconciliation";

const now = new Date("2026-11-06T12:00:00.000Z");

describe("safe evidence recovery candidate triage", () => {
  it("always flags explicit cleanup-required attempts for manual review", () => {
    expect(evidenceRecoveryReason({
      state: "cleanup_required", updatedAt: now,
      hasEvidenceReference: true, now,
    })).toBe("cleanup_pending_review");
  });

  it("flags only stale reserved attempts; recent transfers must not be disrupted", () => {
    const withinWindow = new Date(now.getTime() - (EVIDENCE_RESERVATION_STALE_MINUTES - 1) * 60_000);
    const stale = new Date(now.getTime() - (EVIDENCE_RESERVATION_STALE_MINUTES + 1) * 60_000);
    expect(evidenceRecoveryReason({
      state: "reserved", updatedAt: withinWindow, hasEvidenceReference: false, now,
    })).toBeNull();
    expect(evidenceRecoveryReason({
      state: "reserved", updatedAt: stale, hasEvidenceReference: false, now,
    })).toBe("stale_upload_reservation");
  });

  it("flags committed uploads that have lost the underlying evidence reference", () => {
    expect(evidenceRecoveryReason({
      state: "committed", updatedAt: now, hasEvidenceReference: false, now,
    })).toBe("missing_evidence_reference");
    expect(evidenceRecoveryReason({
      state: "committed", updatedAt: now, hasEvidenceReference: true, now,
    })).toBeNull();
  });
});
