# D-011B.4 — Recovery Executor Safety Boundary

Status: DESIGN APPROVED / SPEC CANDIDATE
Date: 2026-09-08
Baseline: main @ 41ce6f3 (D-011B.3a/3b merged)

## 1. Objective
Introduce a strict execution safety boundary between the already-approved recovery decision/coordination flow and any future infrastructure side effect. D-011B.4 MUST remain simulation-only and MUST NOT perform real restart, failover, rollback, restore, migration, systemd, Docker, Kubernetes, process-control, or server recovery actions.

## 2. Context
D-011A provides passive health/watchdog/circuit-breaker capabilities. D-011B.1 provides recovery policy and dry-run. D-011B.2 defines the recovery action contract and simulated adapter harness. D-011B.3a/3b adds fail-closed authorization, default-off kill switch, lease/fencing, persistent reservation/idempotency and cross-instance coordination without real side effects.

D-011B.4 hardens the final boundary immediately before execution so future infrastructure adapters cannot bypass authorization, ownership, fencing, idempotency, timeout, cancellation, or audit controls.

## 3. Safety invariants
1. Fail closed on missing, stale, mismatched, malformed, or unverifiable execution context.
2. Kill switch remains OFF by default.
3. Every execution request must bind tenant, component, recovery action, request/idempotency identity, authorization decision, reservation and current lease/fencing token.
4. Lease/fencing validity must be revalidated immediately before adapter invocation.
5. A consumed/completed idempotency identity cannot create a second execution side effect.
6. Cancellation and timeout must produce deterministic terminal outcomes.
7. Public/API/log output must not expose secrets, credentials, stack traces or infrastructure-sensitive details.
8. Audit records must describe requested action, authorization/coordination identity, timestamps, sanitized outcome and reason code.
9. D-011B.4 accepts only simulation/no-op executors. Any real infrastructure executor is structurally rejected.
10. No automatic escalation from simulation to real execution is allowed.

## 4. Components
### 4.1 RecoveryExecutionRequest
Immutable typed command containing tenantId, componentId, actionType, requestId/idempotencyKey, reservationId, leaseId/fencingToken, authorization reference, timeout/deadline and correlation metadata.

### 4.2 RecoveryExecutorPort
Narrow interface invoked only after all pre-execution guards pass. It returns a typed sanitized result and supports cooperative cancellation/timeout.

### 4.3 ExecutionSafetyGuard
Single pre-invocation gate responsible for validating authorization, kill switch policy, request/reservation identity binding, current lease ownership/fencing token, idempotency state, allowed action type and simulation-only executor capability.

### 4.4 Simulated/NoOp Executor
The only executor enabled in D-011B.4. It records deterministic simulated outcomes and performs no infrastructure side effect.

### 4.5 Execution Ledger / Audit
Persistent execution state machine: prepared -> executing -> succeeded|failed|timed_out|cancelled|rejected. Transitions are monotonic and idempotent. Audit output is sanitized.

## 5. Execution flow
1. Coordinator produces a prepared recovery context.
2. Executor boundary receives RecoveryExecutionRequest.
3. ExecutionSafetyGuard validates all bindings and current fencing ownership.
4. Ledger atomically reserves/advances the execution identity.
5. Boundary verifies executor capability == simulation/no-op.
6. Simulated executor runs under timeout/cancellation control.
7. Terminal state and sanitized audit result are persisted.
8. Replays return the existing terminal result or deterministic conflict/rejection; they never execute twice.

## 6. Error handling
Use stable reason codes rather than raw exceptions: unauthorized, kill_switch_off, stale_lease, fencing_mismatch, reservation_mismatch, duplicate_execution, unsupported_action, real_executor_forbidden, timeout, cancelled, simulated_failure, internal_sanitized_failure.

Unknown errors fail closed and are converted to a sanitized internal failure while preserving internal correlation for diagnostics.

## 7. Testing / TDD gates
Implementation must proceed RED -> GREEN in small commits. Required tests include: valid simulation path; kill-switch rejection; stale lease; fencing mismatch; reservation/request mismatch; duplicate/replay behavior; concurrent execution exclusion; timeout; cooperative cancellation; unsupported action; real-executor structural rejection; sanitized errors/audit; tenant isolation; no regression of D-011A and D-011B.1-3.

Final gates: targeted tests, full test suite, typecheck, build, security checks and review with zero Critical/Important findings before promotion from Draft.

## 8. Explicitly out of scope
- Real restart or process termination.
- systemd/service manager adapters.
- Docker Engine/container restart adapters.
- Kubernetes rollout/restart/eviction adapters.
- VM/cloud provider actions.
- Database failover, restore or migration.
- Automatic rollback.
- Deployment or production configuration changes.

These require a separate D-011B.5+ design and explicit approval.

## 9. Rollout
No production side effects. Feature remains simulation-only and default-safe. Existing D-011B.3 controls remain authoritative. No real adapter may be registered through configuration, dependency injection or runtime discovery.

## 10. Acceptance criteria
D-011B.4 is accepted when the codebase has one auditable, fail-closed execution boundary; every simulated execution is fenced, idempotent, timeout/cancellation-aware and sanitized; attempts to use real executors are rejected structurally; and all quality/security gates are GREEN.
