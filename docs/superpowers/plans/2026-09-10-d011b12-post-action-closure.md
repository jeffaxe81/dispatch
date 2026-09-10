# D-011B.12 Post-Action Closure Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a pure, append-only, verifiable post-action closure receipt that consumes only a valid D-011B.11 reconciliation receipt and never mutates the recovery ledger.

**Architecture:** Add one pure production module and one focused Vitest suite. The builder first verifies the B11 receipt, derives `closed_verified` or `closed_rejected`, and hashes the closure with tenant context; the verifier checks type/version, hash, semantic state, and timeline. No existing runtime file is modified.

**Tech Stack:** TypeScript 5.9.3, Node.js `node:crypto` SHA-256, Vitest 2.1.9, pnpm 10.4.1.

**Spec:** `docs/superpowers/specs/2026-09-10-d011b12-post-action-closure-design.md`

## Global Constraints

- `completed_success` keeps its current meaning: simulated execution completed successfully.
- Keep the current recovery ledger state machine unchanged.
- Keep D-011B.4 through D-011B.11 contracts unchanged.
- `simulation-only`.
- `fail-closed`.
- `audit-only`.
- No `RecoveryActionRecord` mutation.
- No compare-and-set introduced by B12.
- No database, network, storage adapter, executor, restart, retry, failover, restore, rollback, migration, deployment, or productive enablement.
- Initial implementation scope is limited to exactly two new runtime/test files: `server/_core/recoveryPostActionClosureAudit.ts` and `server/_core/recoveryPostActionClosureAudit.test.ts`.
- If implementation requires modifying an existing runtime contract, stop and reclassify the microdelivery before changing scope.
- Merge to `main` remains blocked until explicit technical-owner approval.

---

## File Structure

- Create `server/_core/recoveryPostActionClosureAudit.ts`: owns B12 receipt types, builder, canonical SHA-256 evidence hash, sanitized closure reason-code validation, and receipt verifier. Pure functions only.
- Create `server/_core/recoveryPostActionClosureAudit.test.ts`: owns B12 fixtures and all positive/fail-closed behavioral tests.
- Read only `server/_core/recoveryPostActionReconciliationAudit.ts`: provides `RecoveryPostActionReconciliationReceipt` and `verifyRecoveryPostActionReconciliationReceipt`.
- Read only B7/B8/B10/B11 helpers from tests to construct realistic evidence fixtures; do not modify them.

---

### Task 1: RED → GREEN — Minimal Closure Contract and Valid B11 Derivation

**Files:**
- Create: `server/_core/recoveryPostActionClosureAudit.test.ts`
- Create: `server/_core/recoveryPostActionClosureAudit.ts`

**Interfaces:**
- Consumes: `RecoveryPostActionReconciliationReceipt` and `verifyRecoveryPostActionReconciliationReceipt({ tenantId, receipt })` from `./recoveryPostActionReconciliationAudit`.
- Produces: `buildRecoveryPostActionClosureReceipt(input)` returning `RecoveryPostActionClosureBuildResult`.
- Produces: `verifyRecoveryPostActionClosureReceipt(input)` returning `RecoveryPostActionClosureReceiptVerification`.
- Produces: `RecoveryPostActionClosureReceipt` with `eventType: "recovery.post_action.closure"` and `evidenceVersion: "d011b12-v1"`.

- [ ] **Step 1: Write the first failing test suite with realistic B11 fixtures**

Create `server/_core/recoveryPostActionClosureAudit.test.ts` with the fixture setup and the first two tests:

```ts
import { describe, expect, it } from "vitest";
import type { RecoveryActionRecord } from "./recoveryActionRecord";
import { buildRecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import { buildRecoveryPostActionVerificationReceipt } from "./recoveryPostActionVerificationAudit";
import { buildRecoveryPostActionReconciliationReceipt } from "./recoveryPostActionReconciliationAudit";
import {
  buildRecoveryPostActionClosureReceipt,
  verifyRecoveryPostActionClosureReceipt,
} from "./recoveryPostActionClosureAudit";

const request = {
  tenantId: "tenant-7",
  actionId: "action-32",
  transitionId: "transition-32",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-10T11:00:00.000Z",
  correlationId: "corr-32",
  reservationId: "reservation-32",
  leaseId: "lease-32",
  leaseNamespace: "d011b3-v1" as const,
  ownerId: "owner-1",
  fencingToken: 6,
  authorizationRef: "auth-32",
  deadlineAt: "2026-09-10T11:05:00.000Z",
};

function reconciliationInputs(verified: boolean) {
  const executionEvent = buildRecoveryExecutionAuditEvent({
    request,
    startedAt: "2026-09-10T11:00:10.000Z",
    finishedAt: "2026-09-10T11:00:20.000Z",
    status: "executed",
    reasonCode: "SIMULATED_SUCCESS",
  });

  const verificationReceipt = buildRecoveryPostActionVerificationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verification: verified
      ? { verified: true as const }
      : { verified: false as const, reasonCode: "HEALTH_NOT_HEALTHY" as const },
    healthCheckedAt: "2026-09-10T11:00:21.000Z",
    recordedAt: "2026-09-10T11:00:22.000Z",
  });

  const record: RecoveryActionRecord = {
    actionId: request.actionId,
    tenantId: request.tenantId,
    componentId: request.componentId,
    correlationId: request.correlationId,
    action: request.action,
    state: "completed_success",
    fencingToken: request.fencingToken,
    createdAt: "2026-09-10T11:00:00.000Z",
    updatedAt: "2026-09-10T11:00:20.000Z",
  };

  return buildRecoveryPostActionReconciliationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verificationReceipt,
    record,
    recordedAt: "2026-09-10T11:00:23.000Z",
  });
}

describe("D-011B.12 post-action closure audit", () => {
  it("builds and verifies closed_verified only from a valid eligible B11 receipt", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });

    expect(result.built).toBe(true);
    if (!result.built) throw new Error("expected closure receipt");

    expect(result.receipt).toMatchObject({
      eventType: "recovery.post_action.closure",
      evidenceVersion: "d011b12-v1",
      reconciliationEvidenceId: reconciliationReceipt.evidenceId,
      executionEvidenceId: reconciliationReceipt.executionEvidenceId,
      verificationEvidenceId: reconciliationReceipt.verificationEvidenceId,
      actionId: request.actionId,
      componentId: request.componentId,
      correlationId: request.correlationId,
      fencingToken: request.fencingToken,
      closureStatus: "closed_verified",
      reasonCode: null,
      reconciliationRecordedAt: reconciliationReceipt.recordedAt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      receipt: result.receipt,
    })).toEqual({ valid: true });
  });

  it("builds closed_rejected and preserves the sanitized B11 reason", () => {
    const reconciliationReceipt = reconciliationInputs(false);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });

    expect(result.built).toBe(true);
    if (!result.built) throw new Error("expected closure receipt");

    expect(result.receipt.closureStatus).toBe("closed_rejected");
    expect(result.receipt.reasonCode).toBe("POST_ACTION_NOT_VERIFIED");
  });
});
```

- [ ] **Step 2: Run only the new suite and verify RED**

Run:

```bash
pnpm vitest run --config vitest.config.ts server/_core/recoveryPostActionClosureAudit.test.ts
```

Expected: FAIL because `./recoveryPostActionClosureAudit` does not exist.

Also run the existing suite to prove the repository baseline is unaffected by the RED test commit:

```bash
pnpm test
```

Expected: all pre-B12 tests remain GREEN; the new B12 suite is the only intentional failure if included by the config.

- [ ] **Step 3: Commit the intentional RED checkpoint**

```bash
git add server/_core/recoveryPostActionClosureAudit.test.ts
git commit -m "test: define D-011B.12 closure contract"
```

- [ ] **Step 4: Add the minimal production module that satisfies the two contract tests**

Create `server/_core/recoveryPostActionClosureAudit.ts`:

```ts
import { createHash } from "node:crypto";
import {
  verifyRecoveryPostActionReconciliationReceipt,
  type RecoveryPostActionReconciliationReceipt,
} from "./recoveryPostActionReconciliationAudit";

export type RecoveryPostActionClosureReasonCode = Exclude<
  RecoveryPostActionReconciliationReceipt["reasonCode"],
  null
>;

export type RecoveryPostActionClosureReceipt = Readonly<{
  eventType: "recovery.post_action.closure";
  evidenceVersion: "d011b12-v1";
  evidenceId: string;
  reconciliationEvidenceId: string;
  executionEvidenceId: string;
  verificationEvidenceId: string;
  actionId: string;
  componentId: string;
  correlationId: string;
  fencingToken: number;
  closureStatus: "closed_verified" | "closed_rejected";
  reasonCode: RecoveryPostActionClosureReasonCode | null;
  reconciliationRecordedAt: string;
  recordedAt: string;
}>;

export type RecoveryPostActionClosureBuildResult =
  | Readonly<{ built: true; receipt: RecoveryPostActionClosureReceipt }>
  | Readonly<{
      built: false;
      reasonCode: "RECONCILIATION_EVIDENCE_INVALID";
    }>;

export type RecoveryPostActionClosureReceiptVerification =
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      reasonCode:
        | "EVIDENCE_MISMATCH"
        | "INVALID_CLOSURE_STATE"
        | "CLOSURE_TIMELINE_INVALID";
    }>;

const allowedRejectedReasons = new Set<RecoveryPostActionClosureReasonCode>([
  "EVIDENCE_CHAIN_INVALID",
  "EXECUTION_OUTCOME_INVALID",
  "POST_ACTION_NOT_VERIFIED",
  "LEDGER_IDENTITY_MISMATCH",
  "LEDGER_FENCING_MISMATCH",
  "LEDGER_STATE_INVALID",
]);

function hashRecoveryPostActionClosureEvidence(input: {
  tenantId: string;
  reconciliationEvidenceId: string;
  executionEvidenceId: string;
  verificationEvidenceId: string;
  actionId: string;
  componentId: string;
  correlationId: string;
  fencingToken: number;
  closureStatus: RecoveryPostActionClosureReceipt["closureStatus"];
  reasonCode: RecoveryPostActionClosureReasonCode | null;
  reconciliationRecordedAt: string;
  recordedAt: string;
}): string {
  const canonicalEvidence = JSON.stringify([
    "d011b12-v1",
    input.tenantId,
    input.reconciliationEvidenceId,
    input.executionEvidenceId,
    input.verificationEvidenceId,
    input.actionId,
    input.componentId,
    input.correlationId,
    input.fencingToken,
    input.closureStatus,
    input.reasonCode,
    input.reconciliationRecordedAt,
    input.recordedAt,
  ]);

  return createHash("sha256").update(canonicalEvidence, "utf8").digest("hex");
}

function isAllowedRejectedReason(
  value: RecoveryPostActionClosureReasonCode | null,
): value is RecoveryPostActionClosureReasonCode {
  return value !== null && allowedRejectedReasons.has(value);
}

export function buildRecoveryPostActionClosureReceipt(input: {
  tenantId: string;
  reconciliationReceipt: RecoveryPostActionReconciliationReceipt;
  recordedAt: string;
}): RecoveryPostActionClosureBuildResult {
  const reconciliation = verifyRecoveryPostActionReconciliationReceipt({
    tenantId: input.tenantId,
    receipt: input.reconciliationReceipt,
  });

  if (!reconciliation.valid) {
    return { built: false, reasonCode: "RECONCILIATION_EVIDENCE_INVALID" };
  }

  const closureStatus = input.reconciliationReceipt.eligible
    ? "closed_verified" as const
    : "closed_rejected" as const;
  const reasonCode = input.reconciliationReceipt.eligible
    ? null
    : input.reconciliationReceipt.reasonCode;

  if (closureStatus === "closed_rejected" && !isAllowedRejectedReason(reasonCode)) {
    return { built: false, reasonCode: "RECONCILIATION_EVIDENCE_INVALID" };
  }

  const evidenceId = hashRecoveryPostActionClosureEvidence({
    tenantId: input.tenantId,
    reconciliationEvidenceId: input.reconciliationReceipt.evidenceId,
    executionEvidenceId: input.reconciliationReceipt.executionEvidenceId,
    verificationEvidenceId: input.reconciliationReceipt.verificationEvidenceId,
    actionId: input.reconciliationReceipt.actionId,
    componentId: input.reconciliationReceipt.componentId,
    correlationId: input.reconciliationReceipt.correlationId,
    fencingToken: input.reconciliationReceipt.fencingToken,
    closureStatus,
    reasonCode,
    reconciliationRecordedAt: input.reconciliationReceipt.recordedAt,
    recordedAt: input.recordedAt,
  });

  return {
    built: true,
    receipt: {
      eventType: "recovery.post_action.closure",
      evidenceVersion: "d011b12-v1",
      evidenceId,
      reconciliationEvidenceId: input.reconciliationReceipt.evidenceId,
      executionEvidenceId: input.reconciliationReceipt.executionEvidenceId,
      verificationEvidenceId: input.reconciliationReceipt.verificationEvidenceId,
      actionId: input.reconciliationReceipt.actionId,
      componentId: input.reconciliationReceipt.componentId,
      correlationId: input.reconciliationReceipt.correlationId,
      fencingToken: input.reconciliationReceipt.fencingToken,
      closureStatus,
      reasonCode,
      reconciliationRecordedAt: input.reconciliationReceipt.recordedAt,
      recordedAt: input.recordedAt,
    },
  };
}

export function verifyRecoveryPostActionClosureReceipt(input: {
  tenantId: string;
  receipt: RecoveryPostActionClosureReceipt;
}): RecoveryPostActionClosureReceiptVerification {
  if (
    input.receipt.eventType !== "recovery.post_action.closure"
    || input.receipt.evidenceVersion !== "d011b12-v1"
  ) {
    return { valid: false, reasonCode: "EVIDENCE_MISMATCH" };
  }

  const expectedEvidenceId = hashRecoveryPostActionClosureEvidence({
    tenantId: input.tenantId,
    reconciliationEvidenceId: input.receipt.reconciliationEvidenceId,
    executionEvidenceId: input.receipt.executionEvidenceId,
    verificationEvidenceId: input.receipt.verificationEvidenceId,
    actionId: input.receipt.actionId,
    componentId: input.receipt.componentId,
    correlationId: input.receipt.correlationId,
    fencingToken: input.receipt.fencingToken,
    closureStatus: input.receipt.closureStatus,
    reasonCode: input.receipt.reasonCode,
    reconciliationRecordedAt: input.receipt.reconciliationRecordedAt,
    recordedAt: input.receipt.recordedAt,
  });

  if (expectedEvidenceId !== input.receipt.evidenceId) {
    return { valid: false, reasonCode: "EVIDENCE_MISMATCH" };
  }

  if (
    (input.receipt.closureStatus === "closed_verified" && input.receipt.reasonCode !== null)
    || (input.receipt.closureStatus === "closed_rejected" && !isAllowedRejectedReason(input.receipt.reasonCode))
  ) {
    return { valid: false, reasonCode: "INVALID_CLOSURE_STATE" };
  }

  const reconciliationRecordedAtMs = Date.parse(input.receipt.reconciliationRecordedAt);
  const recordedAtMs = Date.parse(input.receipt.recordedAt);
  if (
    !Number.isFinite(reconciliationRecordedAtMs)
    || !Number.isFinite(recordedAtMs)
    || recordedAtMs < reconciliationRecordedAtMs
  ) {
    return { valid: false, reasonCode: "CLOSURE_TIMELINE_INVALID" };
  }

  return { valid: true };
}
```

- [ ] **Step 5: Run the focused suite and verify GREEN**

```bash
pnpm vitest run --config vitest.config.ts server/_core/recoveryPostActionClosureAudit.test.ts
```

Expected: 2 B12 tests PASS.

- [ ] **Step 6: Run TypeScript validation before committing GREEN**

```bash
pnpm check
```

Expected: exit code 0.

- [ ] **Step 7: Commit the minimal GREEN implementation**

```bash
git add server/_core/recoveryPostActionClosureAudit.ts server/_core/recoveryPostActionClosureAudit.test.ts
git commit -m "feat: add D-011B.12 closure audit receipt"
```

---

### Task 2: RED → GREEN — Fail-Closed Origin, Tenant, Semantic, Timeline, and Tamper Hardening

**Files:**
- Modify: `server/_core/recoveryPostActionClosureAudit.test.ts`
- Modify only if a test exposes a defect: `server/_core/recoveryPostActionClosureAudit.ts`

**Interfaces:**
- Consumes: the Task 1 builder/verifier interfaces unchanged.
- Produces: verified fail-closed behavior for invalid B11 origin, tenant mismatch, semantic corruption, timeline corruption, and protected-field tampering.

- [ ] **Step 1: Add failing tests for invalid B11 origin and tenant mismatch**

Append inside the existing `describe` block:

```ts
  it("does not build any B12 receipt from a tampered B11 receipt", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const tampered = {
      ...reconciliationReceipt,
      actionId: "action-tampered",
    };

    expect(buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt: tampered,
      recordedAt: "2026-09-10T11:00:24.000Z",
    })).toEqual({
      built: false,
      reasonCode: "RECONCILIATION_EVIDENCE_INVALID",
    });
  });

  it("does not build any B12 receipt when the B11 tenant context is wrong", () => {
    const reconciliationReceipt = reconciliationInputs(true);

    expect(buildRecoveryPostActionClosureReceipt({
      tenantId: "tenant-other",
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    })).toEqual({
      built: false,
      reasonCode: "RECONCILIATION_EVIDENCE_INVALID",
    });
  });
```

Run:

```bash
pnpm vitest run --config vitest.config.ts server/_core/recoveryPostActionClosureAudit.test.ts
```

Expected: if Task 1 implementation is correct, these may already PASS. If they pass, keep them as regression coverage and continue; do not manufacture a failure by weakening code.

- [ ] **Step 2: Add verifier tests for tenant mismatch and protected-field tampering**

Append:

```ts
  it("rejects an existing B12 receipt under the wrong tenant context", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });
    if (!result.built) throw new Error("expected closure receipt");

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: "tenant-other",
      receipt: result.receipt,
    })).toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
  });

  it("rejects tampering of a protected identity field", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });
    if (!result.built) throw new Error("expected closure receipt");

    const tampered = {
      ...result.receipt,
      fencingToken: result.receipt.fencingToken + 1,
    };

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      receipt: tampered,
    })).toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
  });
```

- [ ] **Step 3: Add semantic-state and timeline hardening tests**

Append:

```ts
  it("rejects a closure recorded before its reconciliation", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:22.999Z",
    });
    if (!result.built) throw new Error("expected closure receipt");

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      receipt: result.receipt,
    })).toEqual({ valid: false, reasonCode: "CLOSURE_TIMELINE_INVALID" });
  });

  it("rejects invalid closure timestamps", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "not-a-timestamp",
    });
    if (!result.built) throw new Error("expected closure receipt");

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      receipt: result.receipt,
    })).toEqual({ valid: false, reasonCode: "CLOSURE_TIMELINE_INVALID" });
  });

  it("rejects an impossible verified/reasonCode combination", () => {
    const reconciliationReceipt = reconciliationInputs(false);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });
    if (!result.built) throw new Error("expected closure receipt");

    const impossible = {
      ...result.receipt,
      closureStatus: "closed_verified" as const,
    };

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      receipt: impossible,
    })).toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
  });
```

Note: because the canonical hash protects `closureStatus`, changing the status without recomputing the private hash must fail first as `EVIDENCE_MISMATCH`. The runtime semantic guard remains necessary for internally constructed or future deserialized receipts whose canonical hash is otherwise consistent.

- [ ] **Step 4: Run the focused suite and inspect any genuine RED failure**

```bash
pnpm vitest run --config vitest.config.ts server/_core/recoveryPostActionClosureAudit.test.ts
```

Expected after correct Task 1 implementation: all B12 tests PASS. If a new test fails because of a real implementation gap, change only `recoveryPostActionClosureAudit.ts` with the smallest correction needed; do not modify B11 or ledger contracts.

- [ ] **Step 5: Run the complete unit suite after hardening**

```bash
pnpm test
```

Expected: all test files PASS with no regression in B4-B11.

- [ ] **Step 6: Commit hardening coverage**

```bash
git add server/_core/recoveryPostActionClosureAudit.test.ts server/_core/recoveryPostActionClosureAudit.ts
git commit -m "test: harden D-011B.12 closure fail-closed behavior"
```

---

### Task 3: Verification Gate and PR Preparation

**Files:**
- Verify only: `server/_core/recoveryPostActionClosureAudit.ts`
- Verify only: `server/_core/recoveryPostActionClosureAudit.test.ts`
- Do not change existing runtime files during this gate.

**Interfaces:**
- Consumes: completed B12 production/test files.
- Produces: evidence that the branch is safe to present for review; does not merge.

- [ ] **Step 1: Run focused B12 tests**

```bash
pnpm vitest run --config vitest.config.ts server/_core/recoveryPostActionClosureAudit.test.ts
```

Expected: every B12 test PASS.

- [ ] **Step 2: Run the full repository test suite**

```bash
pnpm test
```

Expected: exit code 0 and all unit tests PASS.

- [ ] **Step 3: Run TypeScript checking**

```bash
pnpm check
```

Expected: exit code 0.

- [ ] **Step 4: Run security regression verification**

```bash
pnpm security:check
```

Expected: exit code 0 with the repository security regression check approved.

- [ ] **Step 5: Run production build**

```bash
pnpm build
```

Expected: exit code 0. Existing VITE analytics/chunk-size warnings may remain if unchanged from baseline; any new B12-specific error is a blocker.

- [ ] **Step 6: Verify the branch diff is constrained to the approved scope**

Run:

```bash
git diff --name-status checkpoint/pre-d011b12-post-action-closure-20260910...HEAD
```

Expected implementation diff:

```text
A server/_core/recoveryPostActionClosureAudit.test.ts
A server/_core/recoveryPostActionClosureAudit.ts
```

The already-approved design and plan documentation commits are allowed on the same feature branch, but no existing runtime file may be modified by the B12 implementation.

- [ ] **Step 7: Inspect the final production module for forbidden effects**

Run:

```bash
grep -nE "compareAndSet|updateState|drizzle|mysql|fetch\(|axios|exec\(|spawn\(|systemd|docker|podman|kubectl|ssh|restart|failover|restore|rollback" server/_core/recoveryPostActionClosureAudit.ts || true
```

Expected: no forbidden effectful call. A textual match is a review trigger, not automatic proof of a violation; inspect any match before proceeding.

- [ ] **Step 8: Commit only if verification required a legitimate B12 correction**

If no files changed during verification, do not create an empty commit. If a legitimate B12-only correction was required and all gates are GREEN:

```bash
git add server/_core/recoveryPostActionClosureAudit.ts server/_core/recoveryPostActionClosureAudit.test.ts
git commit -m "fix: finalize D-011B.12 closure verification"
```

- [ ] **Step 9: Open a Draft PR against `main` with merge blocked**

PR title:

```text
D-011B.12 — Post-Action Closure Audit
```

PR body must state:

```text
D-011B.12 adds a pure append-only post-action closure receipt derived only from a valid B11 reconciliation receipt.

Safety boundaries preserved: simulation-only, fail-closed, audit-only, no ledger mutation, no CAS, no database/network/executor integration, no restart/retry/failover/restore/rollback/migration, and no deploy or productive enablement.

Verification required before review: focused B12 tests, full pnpm test, pnpm check, pnpm security:check, and pnpm build.

Merge remains blocked until explicit technical-owner approval.
```

Expected: PR is Draft, targets `main`, and contains only the approved B12 implementation plus its approved design/plan documentation.

---

## Self-Review Checklist

- Spec coverage: builder origin verification, positive/rejected closure semantics, tenant-bound SHA-256, semantic state guard, timeline guard, identity/fencing tamper detection, compatibility, and safety boundaries are all mapped to Tasks 1-3.
- Placeholder scan: plan contains no deferred implementation placeholders.
- Type consistency: all tasks use the same `RecoveryPostActionClosureReceipt`, `RecoveryPostActionClosureBuildResult`, `buildRecoveryPostActionClosureReceipt`, and `verifyRecoveryPostActionClosureReceipt` names/signatures.
- Scope: no task requires changing an existing runtime contract.
- Merge gate: implementation completion and CI success do not authorize merge into `main`.
