# D-011B.2 — Recovery Action Contract + Simulated Adapter Harness

## Status
Design approved in chat on 2026-09-08. This specification formalizes the next microdelivery after D-011B.1. No production implementation is authorized by this document alone.

## Goal
Introduce a stable, testable contract between recovery orchestration and future recovery adapters, while preserving the hard safety boundary established in D-011B.1: D-011B.2 must remain simulation-only and must not perform any real operational recovery action.

The delivery exists to prove the semantics, limits, error model, observability, and concurrency behavior of a future recovery adapter without calling the operating system, containers, Kubernetes, VMs, databases, backup/restore tooling, or arbitrary commands.

## Non-goals
D-011B.2 MUST NOT implement or invoke:
- process restart or kill;
- `exec`, `spawn`, shell commands, `systemctl`, service managers, or supervisor controls;
- Docker/Podman/container runtime APIs;
- Kubernetes APIs, Jobs, Deployments, Pods, Nodes, leases, or rollouts;
- VM/hypervisor/cloud restart APIs;
- database restart, failover, promotion, replication control, migration, or restore;
- automatic rollback;
- filesystem replacement or package restore;
- `server/recovery` backup/restore as an automatic self-healing action;
- network device changes, firewall changes, port changes, or host reboot;
- additional watchdog/recovery schedulers.

Any later delivery that crosses one of these boundaries requires a separate architectural design, written specification, explicit approval, TDD plan, and independent merge gate.

## Context and relationship to D-011B.1
D-011B.1 established:
- passive health/watchdog input;
- Recovery Policy Engine;
- in-memory policy state;
- cooldown and rolling-window limits;
- circuit breaker;
- transition idempotency;
- one in-flight orchestration per component;
- dry-run execution;
- sanitized audit/observability;
- structural tests forbidding real recovery mechanisms.

D-011B.2 does not weaken or replace those controls. It introduces a clearer action boundary so the orchestrator can call an abstract port whose only concrete implementation in this delivery is a deterministic simulator.

## Recommended architecture

### 1. RecoveryActionPort
Create a narrow interface representing execution of one already-authorized recovery action.

Conceptual contract:
- input: immutable `RecoveryActionRequest` plus an optional cooperative cancellation token/signal owned by the caller;
- output: immutable `RecoveryActionResult`;
- no direct dependency on watchdog internals;
- no responsibility for policy decisions;
- no responsibility for retries or cooldown;
- no responsibility for choosing a component;
- no exposure of raw infrastructure handles or credentials.

The orchestrator remains the caller. The Policy Engine remains the authority that decides whether an action may be attempted.

The cancellation token/signal is an in-process control primitive only. It must not represent a process signal, shell signal, container command, network call, or infrastructure handle.

### 2. Closed action catalog
D-011B.2 supports a deliberately closed action vocabulary.

Initial action kind:
- `restart_component`

This is a semantic intention only. In D-011B.2 it never maps to a real restart API.

Unknown action kinds are rejected by default. There is no generic command/string field that could become a shell escape hatch.

### 3. RecoveryActionRequest
The runtime request contains only sanitized operational metadata required to describe the simulated action:
- `actionId`: unique immutable id for this attempted action;
- `transitionId`: source transition correlation id;
- `componentId`: allowlisted logical component id;
- `action`: closed action kind;
- `requestedAt`: normalized timestamp;
- `correlationId`: trace/run correlation id.

The runtime request MUST NOT contain any simulation scenario selector. Simulation outcomes are configured only through the test harness/factory that constructs the simulated adapter. This prevents production/runtime callers from selecting arbitrary simulated behavior through the action contract.

The request also MUST NOT contain:
- shell command text;
- executable paths;
- host credentials;
- database DSNs;
- tokens/secrets;
- raw URLs containing credentials;
- arbitrary environment variables;
- container IDs, pod UIDs, SSH details, or cloud credentials.

### 4. RecoveryActionResult
The result is normalized and sanitized.

Allowed result states:
- `simulated_success`;
- `simulated_failure`;
- `simulated_timeout`;
- `simulated_cancelled`.

Suggested fields:
- `actionId`;
- `componentId`;
- `status`;
- `startedAt`;
- `finishedAt`;
- `durationMs`;
- `correlationId`;
- optional stable `reasonCode` from a closed vocabulary.

Raw exceptions, stack traces, command output, stderr, credentials, and infrastructure responses are forbidden from the public/audit result.

### 5. SimulatedRecoveryAdapter
The only concrete adapter in D-011B.2 is a deterministic in-process simulator implementing `RecoveryActionPort`.

It must:
- produce controlled success, failure, timeout, and cancellation outcomes;
- obtain its deterministic scenario from constructor/factory configuration supplied by the test harness, never from `RecoveryActionRequest`;
- support deterministic timing through injected clock/timer controls or test-safe hooks;
- never import Node process execution modules;
- never call network APIs;
- never touch `server/recovery` restore/backup code;
- never write operational system state;
- be safe to run inside unit tests and CI.

The simulator exists to validate semantics, not to emulate a real service manager in detail.

### 6. Harness
Provide a test harness/factory around the simulator so test code can specify deterministic scenarios without exposing unsafe production knobs.

The harness is test-only infrastructure. Production bootstrap must not expose the scenario selector, must not read it from environment variables, and must not make it remotely configurable.

If a runtime diagnostic surface is added later, it requires separate approval. D-011B.2 must not add an HTTP endpoint, admin UI, CLI command, environment switch, or remote trigger for selecting simulated recovery outcomes.

### 7. Orchestrator integration
Replace or adapt the current D-011B.1 dry-run execution seam so that the orchestrator invokes `RecoveryActionPort` rather than depending on a concrete dry-run executor shape.

Required properties:
- Policy Engine decision remains upstream and authoritative;
- only an `execute` decision may reach the port;
- suppress/escalate decisions never call the port;
- one in-flight action per component remains enforced;
- different components may execute simulations concurrently;
- executor failure cannot crash the watchdog/server;
- action result is converted into sanitized audit events;
- no automatic retry loop is added here; attempt limits stay controlled by policy/orchestration semantics.

### 8. Default-deny component mapping
Only known logical component ids may be converted into `RecoveryActionRequest`.

Unknown components must fail closed before adapter execution. No dynamic discovery of services/processes/containers is allowed in this delivery.

### 9. Cancellation and timeout semantics
D-011B.2 defines these semantics now so future real adapters cannot invent incompatible behavior.

Timeout:
- the adapter receives a bounded timeout policy through construction/configuration owned by the composition root, not arbitrary request data;
- the simulator uses an injected/test-safe clock or timer abstraction so timeout tests do not depend on real wall-clock delays;
- timeout yields exactly one `simulated_timeout` result;
- timeout does not cause a second hidden execution;
- timeout does not crash the orchestrator.

Cancellation:
- the orchestrator may provide a cooperative in-process cancellation token/signal to the port;
- the simulator checks that token/signal only at deterministic test-safe boundaries;
- cancelled actions yield exactly one `simulated_cancelled` result;
- cancellation must not be reported as success;
- cancellation must release the per-component in-flight guard;
- cancellation does not call any process signal, OS primitive, container API, or network API.

No retry is implicit in success, failure, timeout, or cancellation.

## Data flow

1. Health Watchdog emits a sanitized stable transition.
2. Recovery Policy Engine evaluates policy state.
3. Recovery Orchestrator receives a policy decision.
4. If decision is non-executable, audit and stop.
5. If decision is executable, orchestrator creates a sanitized `RecoveryActionRequest` using a closed mapper/allowlist.
6. Orchestrator obtains the per-component in-flight lock.
7. `RecoveryActionPort.execute(request, cancellation?)` is invoked.
8. `SimulatedRecoveryAdapter` returns one deterministic normalized result.
9. Orchestrator emits sanitized audit/result information.
10. In-flight lock is released in all terminal paths.

No external side effect exists anywhere in this path for D-011B.2.

## Error handling

### Policy or mapping error
Fail closed. Do not call the adapter. Emit only a sanitized stable reason code.

### Adapter throws unexpectedly
Catch locally in the orchestrator boundary. Convert to a sanitized simulated failure/audit event. Never propagate raw exception content into public logs or watchdog control flow.

### Unknown action
Reject before adapter invocation.

### Unknown component
Reject before adapter invocation.

### Duplicate action id
The action boundary must be idempotent for a duplicate `actionId` during its in-memory lifetime. A duplicate must not cause a second simulated execution.

The first terminal normalized result for an `actionId` is retained in-memory and reused for exact duplicate calls during that lifetime. If the duplicate conflicts on immutable identity fields (`componentId`, `action`, `transitionId`), fail closed with a stable sanitized reason code rather than executing again.

Persistence/distributed idempotency is not part of D-011B.2; it belongs to a later delivery for multi-instance coordination.

## State and multi-instance limitation
D-011B.2 may use in-memory state for action idempotency and harness coordination because it still has no real side effects.

The specification explicitly preserves this limitation: in-memory coordination is insufficient before enabling real recovery in a multi-replica deployment. A later delivery must introduce a distributed lease/lock/idempotency mechanism before any active adapter can be approved for Kubernetes or horizontally scaled environments.

## Audit and observability
Every executable simulation attempt must emit sanitized structured audit metadata sufficient to answer:
- what logical component was targeted;
- which semantic action was requested;
- why it was allowed by policy;
- correlation/transition/action ids;
- normalized simulated result;
- timestamps and bounded duration;
- whether execution was suppressed because of concurrency/idempotency/default-deny.

Forbidden audit content includes secrets, raw exception messages, stack traces, shell text, infrastructure payloads, DSNs, access tokens, and credential-bearing URLs.

## Security invariants
D-011B.2 must add/extend structural regression tests that prove:
- no imports from `child_process`;
- no `exec`, `execFile`, `spawn`, `fork`;
- no `systemctl`, `service`, `docker`, `podman`, `kubectl` command construction;
- no Kubernetes/Docker SDK dependencies in the D-011B.2 action path;
- no calls into automatic restore/failover/migration code;
- no generic arbitrary command field in the action contract;
- no runtime simulation-scenario field, env switch, HTTP route, UI, or CLI for selecting simulator outcomes;
- the only concrete runtime adapter is the simulated adapter;
- no new scheduler/timer loop for recovery orchestration.

The test should avoid false positives on documentation/test fixture strings while still scanning the actual implementation boundary.

## Test strategy
Implementation must follow RED → GREEN TDD.

Required test groups:
1. `RecoveryActionPort` contract typing/shape and closed action vocabulary.
2. deterministic simulated success.
3. deterministic simulated failure with sanitized reason code.
4. deterministic simulated timeout with injected time control.
5. deterministic cooperative in-process cancellation.
6. duplicate `actionId` returns the first result without executing twice.
7. conflicting duplicate `actionId` fails closed without executing twice.
8. unknown component rejected before adapter call.
9. unknown action rejected before adapter call.
10. suppress/escalate policy decisions do not call the port.
11. one in-flight simulation per component.
12. different components may simulate concurrently.
13. thrown adapter error is isolated and sanitized.
14. in-flight lock is released on success/failure/timeout/cancel/throw.
15. audit event contains stable metadata and no raw secret/error payload.
16. structural safety boundary proves absence of real operational adapter capability and runtime scenario controls.
17. regression tests for D-011A and D-011B.1 remain green.
18. full repository security, TypeScript, test suite, and build gates remain green on exact PR head and after merge.

## Proposed file boundaries
Exact names may be adjusted during implementation planning, but responsibilities must stay separated:
- `server/_core/recoveryAction.ts` — request/result/action vocabulary and port interface;
- `server/_core/simulatedRecoveryAdapter.ts` — only concrete D-011B.2 adapter;
- `server/_core/recoveryActionHarness.ts` — deterministic test-only harness/factory if needed;
- `server/_core/recoveryOrchestrator.ts` — adapts existing orchestration to the port;
- focused `*.test.ts` files;
- extend `server/d011b1SafetyBoundary.test.ts` or add a D-011B.2-specific structural boundary test.

Do not place this subsystem under `server/recovery`, because that directory remains the disaster-recovery backup/restore domain.

## Acceptance criteria
D-011B.2 is complete only when all of the following are true:
- a closed `RecoveryActionPort` contract exists;
- the only concrete implementation is simulation-only;
- orchestrator uses the port without changing Policy Engine authority;
- success/failure/timeout/cancel are deterministic and tested;
- duplicate action execution is suppressed with stable same-result semantics;
- conflicting duplicate identities fail closed;
- component allowlist/default-deny is enforced;
- audit/error handling is sanitized;
- no runtime control can choose simulator outcomes;
- no active operational recovery mechanism exists;
- structural safety tests are green;
- full security/TypeScript/test/build gates are green on exact head;
- final review has no Critical/Important findings;
- controlled merge receives explicit human authorization;
- post-merge gate on `main` is green.

## Deferred work
The following remain explicitly deferred:
- D-011B.3 real controlled adapter for a narrowly approved environment;
- distributed leases/locks/idempotency for multi-instance active recovery;
- operational kill switch/manual override UI;
- environment-specific recovery credentials and secrets management;
- database/VM/Kubernetes failover;
- automatic backup restore;
- chaos drills involving real process/service interruption.

Each deferred item requires its own design and approval gate.
