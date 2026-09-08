# D-011B.3 — Controlled Recovery Adapter Design

## Status
Design approved in chat on 2026-09-08. This specification defines the architecture and safety constraints for the first future active recovery adapter. It does **not** authorize implementation or operational activation by itself.

## Goal
Define a narrowly-scoped, fail-closed architecture that can later permit one explicitly approved logical component in one explicitly approved environment to perform one controlled recovery action through the existing `RecoveryActionPort`, while preserving the D-011A/D-011B.1/D-011B.2 safety boundaries.

The purpose of D-011B.3 is to make the active boundary reviewable before any real restart capability exists in code.

## Mandatory scope restriction
D-011B.3 is intentionally narrower than a generic self-healing framework.

The first active adapter design MUST be restricted to:
- exactly one deployment environment class approved in configuration;
- exactly one logical component identity approved in configuration;
- exactly one semantic action: `restart_component`;
- exactly one infrastructure mechanism selected in a later implementation plan;
- a default-disabled operational kill switch;
- explicit policy and action authorization before the adapter boundary.

No wildcard component selectors, dynamic service discovery, arbitrary command strings, arbitrary unit/container names, or generic shell execution are permitted.

## Non-goals
D-011B.3 MUST NOT introduce or authorize:
- generic shell execution;
- arbitrary `exec`, `spawn`, `fork`, `execFile`, or command construction;
- unrestricted systemd, Docker, Podman, Kubernetes, hypervisor, cloud, SSH, or remote execution adapters;
- database promotion/failover;
- backup restore or automatic disaster recovery;
- migration, schema change, package replacement, host reboot, firewall change, or port manipulation;
- multi-region failover;
- cascading recovery across multiple components;
- automatic rollback to an older application version;
- a remotely exposed endpoint/UI/CLI that can bypass policy and invoke the active adapter directly;
- hidden retry loops independent from `RecoveryPolicyEngine` limits;
- automatic activation merely because code is deployed.

Any capability above requires a separate design/specification and explicit approval.

## Relationship to earlier deliveries

### D-011A
Provides detection-only health registry/watchdog behavior. D-011A remains unaware of operational adapter details.

### D-011B.1
Provides policy authority, cooldown, attempt limits, circuit breaker, stabilized health evidence, idempotent transition decisions, and orchestrator in-flight protection.

### D-011B.2
Provides:
- closed `RecoveryActionPort`;
- closed `restart_component` semantic intention;
- default-deny component mapper;
- normalized action result;
- simulated adapter;
- action idempotency semantics;
- sanitized audit;
- structural tests proving the absence of active operational capabilities.

D-011B.3 MUST extend these boundaries rather than bypass or duplicate them.

## Recommended architecture

```text
HealthRegistry
   -> HealthWatchdog
   -> RecoveryPolicyEngine
   -> RecoveryOrchestrator
   -> RecoveryActionAuthorizationGate
   -> DistributedRecoveryLease
   -> ControlledRecoveryAdapter
   -> PostActionVerifier
   -> Audit / RecoveryPolicy state
```

The new layers are deliberately explicit. The active adapter must never be callable as the first authorization point.

## 1. RecoveryActionAuthorizationGate

Introduce a pure, deterministic authorization gate between the orchestrator mapper and the active adapter.

It receives only sanitized metadata already produced by the recovery action boundary plus immutable deployment authorization configuration.

Minimum decision inputs:
- `actionId`;
- `componentId`;
- action kind;
- deployment environment identifier/class;
- kill-switch state;
- configured active component allowlist;
- configured active action allowlist;
- policy decision/correlation identity;
- lease namespace/version.

It returns a closed decision:
- `authorized`;
- `denied` with a stable enumerated reason code.

Initial denial reasons MUST include at least:
- `ACTIVE_RECOVERY_DISABLED`;
- `ENVIRONMENT_NOT_AUTHORIZED`;
- `COMPONENT_NOT_AUTHORIZED`;
- `ACTION_NOT_AUTHORIZED`;
- `AUTHORIZATION_CONFIG_INVALID`.

The gate never calls infrastructure.

### Default behavior
Fail closed. Missing, malformed, ambiguous, or partial configuration MUST deny active recovery.

## 2. Operational kill switch

Active recovery must remain OFF by default after deployment.

The kill switch must satisfy all of these:
- default value is disabled;
- absence of configuration means disabled;
- malformed configuration means disabled;
- cannot be enabled by request payload;
- cannot be enabled by health event metadata;
- cannot be enabled by component-controlled input;
- state is auditable;
- adapter must re-check authorization immediately before the side-effect boundary.

A later implementation may choose an environment variable or configuration source, but the implementation plan must ensure it is deployment/operator-controlled and not remotely mutable through application APIs.

## 3. Environment restriction

The first active adapter must be authorized for exactly one named environment class.

Recommended initial values conceptually:
- `development-controlled` or `homologation-controlled`;
- production remains explicitly denied.

The implementation plan MUST choose one concrete initial environment. If no safe isolated environment exists, active implementation must not proceed.

Production activation is out of scope for the first D-011B.3 implementation cycle.

## 4. Component restriction

The active component set must be independent from:
- health observability;
- readiness blocking;
- D-011B.1 simulated recoverability.

A component being critical or recoverable in simulation MUST NOT imply permission for active restart.

The first implementation must select exactly one logical component from the already-known set and bind it statically in trusted configuration. No component name supplied by an HTTP client/event may become an infrastructure target without a fixed mapping.

## 5. Fixed target mapping

Introduce a trusted mapping from logical component identity to one fixed operational target descriptor.

The descriptor must be a closed type specific to the chosen infrastructure adapter. It must not contain a generic command string.

Example conceptual shape:

```ts
type ControlledTarget = Readonly<{
  componentId: "<single-approved-component>";
  targetId: "<fixed-approved-target>";
}>;
```

The exact target and adapter mechanism are deferred to implementation planning and must be reviewed before code is written.

Unknown or mismatched mappings fail closed.

## 6. DistributedRecoveryLease

Before any real action is allowed, D-011B.3 requires coordination that is safe across multiple application replicas.

The lease abstraction must provide:
- atomic acquire by logical component/action namespace;
- owner/token identity;
- TTL/expiry;
- release by owner token only;
- compare-and-release semantics;
- fail-closed behavior when the coordination backend is unavailable;
- no local-memory fallback for active recovery;
- audit-safe identifiers only.

Conceptual interface:

```ts
export type RecoveryLease = Readonly<{
  leaseId: string;
  componentId: string;
  ownerId: string;
  expiresAt: string;
}>;

export type RecoveryLeasePort = {
  acquire(input: {
    componentId: string;
    actionId: string;
    ownerId: string;
    ttlMs: number;
  }): Promise<RecoveryLease | null>;
  release(lease: RecoveryLease): Promise<void>;
};
```

`null` means another actor owns the lease and active execution must be suppressed.

The exact persistence backend is deferred. Active adapter implementation MUST NOT ship until a real atomic backend is selected and tested.

## 7. Persistent action idempotency

D-011B.2 in-memory idempotency is insufficient for real side effects.

Before active execution, the system must persist an action record keyed by `actionId` with immutable identity fields and terminal/non-terminal state.

Minimum states:
- `reserved`;
- `executing`;
- `completed_success`;
- `completed_failure`;
- `verification_failed`;
- `unknown_outcome`.

Required semantics:
- exact duplicate terminal action reuses stored result;
- conflicting duplicate fails closed;
- non-terminal duplicate does not create a second action;
- persistence failure before action means no side effect;
- ambiguous persistence failure after side effect yields `unknown_outcome` and MUST NOT automatically retry.

No automatic retry is permitted for `unknown_outcome`.

## 8. ControlledRecoveryAdapter

The active adapter must implement `RecoveryActionPort` or a narrowly-derived active port while preserving the normalized action contract.

It must:
- accept only pre-authorized, fixed-mapped requests;
- have no generic command field;
- perform exactly one bounded operational action;
- use a fixed infrastructure API/mechanism chosen by the implementation plan;
- enforce its own target allowlist as defense in depth;
- implement bounded timeout;
- avoid implicit retries;
- return only normalized/sanitized results;
- never expose stdout/stderr/raw infrastructure responses/secrets;
- never invoke `server/recovery` backup/restore code.

It must not:
- discover arbitrary targets;
- interpolate target names into shell commands;
- accept arbitrary environment variables/arguments;
- escalate privilege dynamically;
- chain to another recovery action.

## 9. Side-effect boundary

The code location that performs the real operational call must be isolated in one small adapter file/module.

The rest of the recovery path must remain testable without importing that module.

Structural tests must make the side-effect boundary obvious and prove that:
- only the approved adapter imports the chosen operational library/API;
- orchestrator, policy, mapper, authorization gate, lease, verifier, and health subsystem do not import execution primitives;
- there is no second hidden execution path.

## 10. PostActionVerifier

A successful operational API response is not enough to declare recovery successful.

After the active action returns, a separate verifier must evaluate post-action health evidence.

The verifier must:
- be logically separate from the adapter;
- consume sanitized health/readiness evidence;
- use a bounded verification window;
- require explicit success criteria;
- distinguish API-action success from actual component recovery;
- never perform another action itself.

Closed verification outcomes:
- `verified_recovered`;
- `verification_failed`;
- `verification_timeout`;
- `verification_unavailable`.

The verifier MUST NOT create a new scheduler/watchdog loop. It must reuse existing health evidence/event mechanisms or a bounded orchestration wait strategy defined in the implementation plan.

## 11. Failure and unknown-outcome handling

### Failure before side effect
Examples: authorization denied, lease unavailable, idempotency reservation failure.

Behavior: no action; sanitized audit; policy remains authoritative.

### Adapter returns explicit failure
Behavior: persist terminal failure, release lease, audit; no hidden retry.

### Adapter timeout / uncertain infrastructure response
If it is impossible to know whether the side effect occurred, mark `unknown_outcome`. Do not retry automatically.

### Verification failure after apparent action success
Persist `verification_failed`; release lease; audit; allow the Recovery Policy Engine to control any later decision according to its own cooldown/circuit limits. Do not immediately retry in the same orchestration cycle.

## 12. Rollback/fallback policy

Automatic rollback is NOT part of the first active adapter implementation.

For D-011B.3, rollback/fallback means only:
- define stable result/audit states;
- define escalation path for operators;
- ensure failed/unknown recovery does not loop;
- leave hooks/interfaces for a future separately-approved rollback delivery.

No version rollback, restore, failover, database promotion, or alternate-host switch may be implemented under D-011B.3 without another approved spec.

## 13. Audit and observability

Every active-recovery evaluation must produce sanitized structured events, including denied attempts.

Suggested events:
- `active_recovery_authorization_evaluated`;
- `active_recovery_denied`;
- `active_recovery_lease_acquired`;
- `active_recovery_lease_denied`;
- `active_recovery_action_reserved`;
- `active_recovery_action_started`;
- `active_recovery_action_completed`;
- `active_recovery_action_unknown`;
- `active_recovery_verification_started`;
- `active_recovery_verified`;
- `active_recovery_verification_failed`;
- `active_recovery_lease_released`.

Audit metadata may include:
- logical component id;
- action id;
- decision/correlation id;
- authorization reason code;
- environment class;
- lease id/owner id in non-secret form;
- normalized action/verification status;
- timestamps/durations.

Forbidden:
- secrets;
- credentials;
- raw stack traces;
- raw infrastructure payloads;
- shell commands;
- database DSNs;
- access tokens;
- credential-bearing URLs.

## 14. Security invariants

The first active adapter implementation must have structural and behavioral tests proving:
- active recovery disabled by default;
- missing configuration disables it;
- production environment denied;
- only the single configured component is permitted;
- only `restart_component` is permitted;
- unknown action/component fail closed;
- a valid distributed lease is required before side effect;
- persistent reservation is required before side effect;
- duplicate action cannot execute twice across independent orchestrator instances sharing the same coordination store;
- lease backend failure suppresses active action;
- idempotency store failure suppresses active action;
- adapter target is fixed and cannot be influenced by untrusted payload;
- adapter errors are sanitized;
- timeout does not trigger an implicit retry;
- ambiguous outcome does not retry automatically;
- post-action verification is required before declaring recovery;
- failure/verification failure releases the lease safely;
- no code path invokes `server/recovery` automatically;
- no arbitrary command API exists;
- no remote API can toggle the kill switch or invoke the adapter directly.

## 15. Deployment activation model

Code deployment and operational activation are separate events.

Recommended sequence:
1. merge code with active recovery disabled;
2. deploy to isolated/homologation environment with kill switch disabled;
3. run simulation/regression gates;
4. explicitly configure the single environment/component/target;
5. operator explicitly enables kill switch;
6. perform a controlled drill with observation;
7. disable kill switch after drill until operational approval exists.

Production enablement requires a separate explicit approval gate and is not implied by successful homologation.

## 16. Proposed implementation decomposition

The implementation plan should split D-011B.3 into small homologatable deliveries rather than one large active-recovery PR.

Recommended sequence:

### D-011B.3a — Authorization Gate + active config model
No real side effect. Adds fail-closed authorization and kill-switch semantics.

### D-011B.3b — Distributed lease + persistent action reservation
No real side effect. Proves cross-instance exclusion and persistent idempotency.

### D-011B.3c — Controlled adapter behind disabled composition root
Introduces the single real side-effect adapter, but runtime activation remains disabled by default and structural tests prevent bypass.

### D-011B.3d — Post-action verifier + controlled drill harness
Adds verification semantics and a controlled homologation procedure. No production enablement.

This decomposition is recommended because it lets each high-risk boundary be tested and approved independently.

## 17. Acceptance criteria for the overall D-011B.3 design

The architecture is ready for implementation planning only when:
- environment restriction is explicit;
- single active component restriction is explicit;
- kill switch is default-off/fail-closed;
- active authorization is separate from D-011B.1 recoverability;
- fixed target mapping is defined;
- distributed lease is mandatory;
- persistent action idempotency is mandatory;
- ambiguous outcomes cannot auto-retry;
- post-action verification is mandatory;
- rollback remains non-operational/deferred;
- active side-effect code is isolated;
- production activation remains out of scope;
- `server/recovery` remains separate;
- implementation is decomposed into independently homologatable microdeliveries.

## Deferred work
The following require later independent approval/specification:
- production activation;
- multiple active components;
- multiple infrastructure adapter types;
- Kubernetes/systemd/Docker generic adapter families;
- automatic rollback;
- database/VM failover;
- backup restore automation;
- multi-region recovery;
- operator UI for manual recovery;
- remote kill-switch management;
- chaos engineering involving real service interruption.
