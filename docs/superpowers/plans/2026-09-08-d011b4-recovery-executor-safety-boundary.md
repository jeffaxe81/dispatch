# D-011B.4 Recovery Executor Safety Boundary — Implementation Plan

> Execution: use superpowers:subagent-driven-development task-by-task. Maintain RED -> GREEN -> review -> commit. No merge to main without final gates and explicit approval.

**Goal:** Introduce one fail-closed, auditable execution boundary after `RecoveryActiveCoordinator`, while keeping the runtime strictly simulation-only.

**Architecture:** Preserve `RecoveryPolicyEngine -> RecoveryOrchestrator -> RecoveryActionPort` and D-011B.3 authorization/lease/reservation semantics. Add a typed execution context and safety boundary that revalidates the current fence immediately before invoking a simulation-capable executor, advances the persistent action record monotonically, handles timeout/cancellation deterministically, and sanitizes failures. No real infrastructure adapter is permitted.

**Tech Stack:** TypeScript 5.9, Vitest 2.1, Node.js 24, pnpm 10, existing `server/_core` architecture.

**Spec:** `docs/superpowers/specs/2026-09-08-d011b4-recovery-executor-safety-boundary-design.md`

## Global Constraints
- Runtime remains simulation-only.
- No `child_process`, `exec`, `spawn`, `fork`, `execFile`, `systemctl`, Docker/Podman/Kubernetes/SSH/hypervisor/cloud SDK execution.
- No endpoint/UI/CLI to trigger active recovery.
- Missing/invalid/stale/mismatched context fails closed.
- Revalidate lease/fencing immediately before executor invocation.
- Persistent reservation/idempotency remains authoritative.
- `unknown_outcome` never auto-retries.
- Public results/audit are sanitized.
- Existing D-011B.3 controls remain authoritative; do not weaken them.

## Task 1 — Typed execution context and executor capability contract
**Create:** `server/_core/recoveryExecution.ts`, `server/_core/recoveryExecution.test.ts`.

RED tests:
- rejects empty/malformed execution identity;
- rejects invalid fencing token/deadline;
- only accepts executor capability `simulation` or `noop`;
- rejects `real`/unknown capability structurally at validation boundary.

GREEN implementation:
- `RecoveryExecutionRequest` binds original `RecoveryActionRequest`, reservation/action identity, lease identity, owner, fencing token, authorization reference, deadline/correlation;
- `RecoveryExecutorPort` exposes explicit capability and typed execute method;
- validation helpers are pure and fail closed.

Commit: `feat(d011b4): add typed recovery execution contract`.

## Task 2 — ExecutionSafetyGuard
**Create:** `server/_core/recoveryExecutionSafetyGuard.ts`, `.test.ts`.

RED tests: authorization denied, kill switch off, request/reservation mismatch, stale lease, owner mismatch, fencing mismatch, unsupported action, non-simulation executor, valid path.

GREEN: compose existing trusted authorization + lease/record checks; return stable reason codes; never throw raw errors outward.

Commit: `feat(d011b4): add fail-closed execution safety guard`.

## Task 3 — Persistent execution ledger transitions
**Modify:** `server/_core/recoveryActionRecord.ts` and tests; add focused execution-ledger tests if needed.

RED: `reserved -> executing -> terminal`; terminal cannot regress; wrong fencing token rejected; duplicate terminal reuses state; `unknown_outcome` terminal/no retry; concurrent transition only one winner.

GREEN: add compare-and-set style transition contract while preserving existing D-011B.3 behavior and state names unless a migration is demonstrably required.

Commit: `feat(d011b4): harden recovery execution ledger transitions`.

## Task 4 — RecoveryExecutionBoundary
**Create:** `server/_core/recoveryExecutionBoundary.ts`, `.test.ts`.

RED: guard runs before executor; fence revalidated immediately before invoke; ledger enters executing before invoke; duplicate/non-terminal cannot invoke twice; real executor forbidden; executor failure sanitized.

GREEN: single orchestration boundary `guard -> atomic transition -> final fence check -> simulation executor -> terminal persist`.

Commit: `feat(d011b4): add guarded recovery execution boundary`.

## Task 5 — Timeout and cooperative cancellation
**Modify:** boundary/contract/tests.

RED: deadline exceeded before invoke rejects; timeout during simulation terminalizes deterministically; cancellation terminalizes deterministically; late executor completion cannot overwrite timeout/cancel terminal state.

GREEN: AbortSignal/deadline orchestration with monotonic ledger semantics.

Commit: `feat(d011b4): enforce execution timeout and cancellation`.

## Task 6 — Sanitized audit result
**Create:** `server/_core/recoveryExecutionAudit.ts`, `.test.ts`; integrate boundary.

RED: no stack/secret/token/host/command leakage; stable reason code; includes action/component/correlation/fencing/time/result; unknown exceptions become `INTERNAL_SANITIZED_FAILURE`.

GREEN: typed sanitizer and audit event builder. Internal diagnostics retain only correlation-safe data.

Commit: `feat(d011b4): add sanitized recovery execution audit`.

## Task 7 — Structural safety boundary
**Create:** `server/d011b4SafetyBoundary.test.ts`.

Tests scan/verify D-011B.4 runtime composition does not import or register real process/container/orchestrator execution and that only simulation/no-op capability reaches the boundary. Preserve D-011B.3 safety tests.

Commit: `test(d011b4): prove simulation-only execution boundary`.

## Task 8 — Runtime composition, still simulation-only
**Modify:** `server/_core/activeRecoveryBootstrap.ts` and tests only as necessary.

RED: default runtime cannot reach a real executor; disabled config remains denied; production remains denied; configured homologation path still resolves only simulated/no-op executor.

GREEN: wire D-011B.4 boundary to the existing simulated adapter without adding remote knobs or active side effects.

Commit: `feat(d011b4): wire safe simulated execution boundary`.

## Task 9 — Regression and final gates
Run targeted D-011B.4 tests, D-011A/D-011B regression, full suite, typecheck, build and existing security/quality workflows. Review diff for forbidden imports and secret leakage. Zero Critical/Important findings before Draft promotion.

Create/update evidence document under `docs/superpowers/reports/` with commands/results and exact commit SHA. Do not mark PR ready or merge until gates are GREEN.

## Acceptance
- one fail-closed execution boundary exists;
- current fencing is checked immediately before invocation;
- persistent execution is idempotent and monotonic;
- timeout/cancellation are deterministic;
- audit is sanitized;
- real executor capability is rejected;
- runtime remains simulation-only;
- all tests/gates GREEN.
