# D-011B.3c.1 — Recovery Agent Contract Design

## Status
Approved direction in chat on 2026-09-08: use a dedicated Recovery Agent and implement the contract/fake phase before any real infrastructure side effect.

This specification authorizes design and later test-only implementation of the D-011B.3c.1 contract boundary. It does **not** authorize a real Docker/systemd/Kubernetes restart, production activation, or deployment drill.

## Goal
Introduce a narrowly-scoped protocol between Dispatch and a dedicated Recovery Agent so that the future D-011B.3c.2 can perform exactly one controlled restart in an isolated homologation environment without giving the Dispatch process generic infrastructure execution capabilities.

D-011B.3c.1 remains side-effect free. It defines and tests:
- a closed request/response protocol;
- a fixed logical-target mapping;
- fencing and authorization evidence carried to the agent boundary;
- normalized timeout/failure/unknown outcomes;
- a fake/in-process Recovery Agent for deterministic tests;
- a client adapter that talks only to that fake contract during this delivery;
- structural safety boundaries proving there is no Docker/systemd/Kubernetes/shell implementation yet.

## Mandatory scope restriction
The first contract is restricted to:
- environment class: `homologation-controlled`;
- logical component: `database`;
- semantic action: `restart_component`;
- fixed agent operation: one closed restart operation;
- fixed target alias known only in trusted deployment configuration;
- active recovery disabled by default;
- production explicitly denied.

No generic infrastructure command, target name, container id, host, executable, argument list, environment override, script, URL, or shell fragment may be accepted from recovery events, HTTP requests, UI, CLI, or other untrusted runtime payloads.

## Relationship to D-011B.3a/3b
D-011B.3a/3b already provides:
- fail-closed authorization;
- default-off kill switch;
- production denial;
- lease abstraction with fencing token;
- persistent action reservation/idempotency contract;
- multi-instance coordinator;
- no active side effect.

D-011B.3c.1 must consume those decisions and identities rather than reimplement policy, authorization, leasing, or idempotency.

The coordinator remains authoritative for ordering:

`authorization -> lease/fencing -> persistent reservation -> revalidation -> agent client boundary`

The agent contract is not an alternative entry point and must not be directly callable from routes/controllers.

## Architecture

```text
RecoveryPolicyEngine
  -> RecoveryOrchestrator
  -> ActiveRecoveryAuthorizationGate
  -> RecoveryActiveCoordinator
       -> lease + fencing
       -> persistent reservation
       -> authorization/fence re-check
       -> RecoveryAgentActionPort
            -> TrustedTargetMapper
            -> RecoveryAgentClient
                 -> FakeRecoveryAgent (D-011B.3c.1 only)
```

D-011B.3c.1 deliberately stops at the fake agent. No infrastructure library is imported.

## 1. Closed agent protocol

### Request
The client may send only a validated, sanitized object with this semantic shape:

```ts
export type RecoveryAgentRequest = Readonly<{
  protocolVersion: "d011b3c1-v1";
  actionId: string;
  decisionId: string;
  componentId: "database";
  action: "restart_component";
  targetAlias: "database-primary-homologation";
  leaseId: string;
  leaseOwnerId: string;
  fencingToken: number;
  requestedAt: string;
}>;
```

The exact TypeScript shape may evolve during planning, but these invariants are mandatory:
- action kind is closed;
- component is closed;
- target alias is closed and fixed;
- no arbitrary command field exists;
- no free-form arguments exist;
- no raw credentials/secrets exist;
- fencing token is a positive integer;
- correlation ids are sanitized bounded strings;
- request is rejected if the trusted mapping does not match `database -> database-primary-homologation`.

### Response
The fake agent returns only normalized states:

```ts
export type RecoveryAgentOutcome =
  | "accepted_completed"
  | "explicit_failure"
  | "timeout_unknown"
  | "rejected_stale_fence"
  | "rejected_target"
  | "rejected_protocol";

export type RecoveryAgentResponse = Readonly<{
  outcome: RecoveryAgentOutcome;
  actionId: string;
  fencingToken: number;
  startedAt: string | null;
  completedAt: string | null;
}>;
```

No stdout, stderr, stack trace, container payload, Docker response, host metadata, secrets, or raw exception text crosses this boundary.

## 2. Trusted target mapping

Introduce a pure mapper owned by the active-recovery module.

Conceptually:

```ts
"database" + "restart_component"
  -> "database-primary-homologation"
```

Rules:
- mapping is compiled/configured from trusted deployment data only;
- unknown component/action fails closed;
- request-provided target aliases are never trusted;
- only one target alias exists in D-011B.3c.1;
- the mapper does not discover containers/services dynamically;
- the mapper does not hold Docker/systemd/Kubernetes identifiers in untrusted event data.

The future D-011B.3c.2 may resolve this alias to a concrete infrastructure target inside the dedicated agent, not inside Dispatch.

## 3. RecoveryAgentActionPort

The Dispatch-side adapter implements a narrow active port and converts a pre-authorized recovery action plus current lease/fencing identity into the closed agent request.

It must:
- require the exact authorized component/action;
- require valid current lease/fence evidence supplied by the coordinator;
- invoke the trusted target mapper;
- call only `RecoveryAgentClient`;
- enforce a bounded request timeout;
- perform no implicit retry;
- normalize all errors;
- return `unknown_outcome` when timeout/transport ambiguity makes execution status uncertain;
- never access Docker socket, systemd, Kubernetes, SSH, hypervisor, cloud SDK, or `server/recovery`.

In D-011B.3c.1 the client is wired only to `FakeRecoveryAgent` in tests/harnesses. Runtime active execution remains disabled/default-off.

## 4. FakeRecoveryAgent

The fake agent is deterministic and in-process/test-only.

It supports configured scenarios:
- `success` -> `accepted_completed`;
- `explicit_failure` -> `explicit_failure`;
- `timeout_unknown` -> unresolved/bounded timeout mapped to `timeout_unknown`;
- `stale_fence` -> `rejected_stale_fence`;
- `wrong_target` -> `rejected_target`;
- `wrong_protocol` -> `rejected_protocol`.

The scenario selector must never enter production bootstrap, HTTP routes, UI, CLI, environment variables, or external configuration used by real runtime.

Tests may inject the scenario directly into the fake constructor/harness.

## 5. Fencing semantics at the agent boundary

D-011B.3c.1 does not create a new lease authority. It carries the fencing generation obtained by D-011B.3b to the agent boundary and makes stale-fence rejection part of the protocol contract.

Required behavior:
- positive integer fencing token required;
- fake agent can model a current accepted generation per target alias;
- request with lower generation is rejected as stale;
- request with current generation may proceed in the fake;
- response echoes the generation for audit correlation;
- no retry is triggered by stale rejection.

The future real agent must have an equivalent or stronger stale-generation check before beginning the infrastructure call. D-011B.3c.2 cannot ship if that guarantee cannot be implemented credibly.

## 6. Timeout and unknown outcome

Timeout handling is safety-critical.

If the Dispatch-side adapter cannot determine whether the agent executed the operation, it returns a normalized uncertain result. That uncertainty must propagate to the persistent action record as `unknown_outcome` under the D-011B.3 contracts.

Rules:
- no automatic retry after timeout/unknown outcome;
- no second attempt in the same orchestration cycle;
- hidden transport-library retries are disabled;
- timeout value is bounded and deployment-controlled;
- raw timeout/transport error details are not exposed to audit consumers.

## 7. Idempotency relationship

The agent contract does not replace persistent idempotency.

The coordinator must reserve the action persistently before invoking the future active port. `actionId` remains the idempotency identity across:
- persistent action record;
- agent request;
- normalized response;
- audit.

For D-011B.3c.1, the fake agent should also reject or deterministically reuse an identical repeated `actionId` and fail closed on a conflicting repeated identity. This is defense in depth; the persistent store remains authoritative.

## 8. Authentication boundary

D-011B.3c.1 defines an interface for trusted caller authentication but does not introduce production secrets or network transport.

Required future properties:
- agent must authenticate the Dispatch recovery client;
- agent must reject unauthenticated callers;
- credentials are deployment-managed, never request-provided;
- credentials are not logged;
- rotation must not require changing event payload contracts.

For D-011B.3c.1, authentication is represented by a test-only trusted-client abstraction or injected verifier, not a real token/certificate.

Real mTLS/HMAC/token choice belongs to D-011B.3c.2 planning and requires review before implementation.

## 9. Runtime activation rules

D-011B.3c.1 must not enable active runtime execution.

Mandatory:
- `ACTIVE_RECOVERY_ENABLED=false` remains the default semantic state;
- production denied;
- existing runtime remains safe if the new files are deployed;
- no route/controller can invoke the agent client;
- no remote kill-switch endpoint exists;
- no background scheduler invokes the agent;
- no bootstrap chooses the fake scenario from environment input;
- no CI test performs a real restart.

## 10. Audit

New sanitized events may include:
- `active_recovery_agent_request_prepared`;
- `active_recovery_agent_call_started`;
- `active_recovery_agent_call_completed`;
- `active_recovery_agent_call_failed`;
- `active_recovery_agent_call_unknown`;
- `active_recovery_agent_rejected_stale_fence`.

Allowed fields:
- logical component id;
- action id;
- decision id;
- target alias;
- lease id/owner id in sanitized form;
- fencing token;
- normalized outcome;
- bounded timestamps/duration.

Forbidden fields:
- credentials;
- raw transport headers;
- raw response body;
- raw infrastructure payload;
- command strings;
- Docker/systemd/Kubernetes identifiers supplied by callers;
- stack traces;
- secrets;
- DSNs;
- credential-bearing URLs.

## 11. Structural safety boundary

D-011B.3c.1 requires a dedicated structural test that scans the implementation files and fails if it finds operational execution primitives or forbidden imports.

At minimum forbid in D-011B.3c.1 production files:
- `child_process`;
- `exec(`, `spawn(`, `fork(`, `execFile(`;
- Docker client libraries / `/var/run/docker.sock`;
- `systemctl` / systemd DBus clients;
- Kubernetes clients;
- Podman;
- SSH clients;
- hypervisor/cloud control SDKs;
- imports from `server/recovery`;
- arbitrary `command`, `args`, `containerId`, `unitName`, `podName`, `host`, `endpoint`, or `script` fields in the action contract;
- HTTP/UI/CLI mutation paths that directly invoke the agent.

It must also assert that the fake agent/harness is not imported by normal production bootstrap.

## 12. Required tests

The implementation plan must include RED->GREEN coverage for at least:
- closed request schema accepts only the approved semantic action;
- unknown component/action/target fails closed before fake execution;
- trusted mapping resolves only `database` to the fixed homologation alias;
- malformed/zero/negative fencing token fails closed;
- stale fencing token rejected by fake agent;
- exact current fencing token accepted by fake agent;
- success normalized without raw payload;
- explicit failure normalized without raw payload;
- timeout becomes unknown outcome and does not retry;
- duplicate identical action does not execute twice in fake;
- conflicting duplicate fails closed;
- test-only auth verifier rejects untrusted caller;
- fake scenario selector cannot enter production bootstrap;
- no active runtime path is enabled;
- structural boundary forbids real infrastructure primitives;
- full existing regression/security/TypeScript/build remains GREEN.

## 13. Files proposed for D-011B.3c.1

Proposed focused modules:
- `server/_core/recoveryAgentProtocol.ts` — closed request/response types and validation;
- `server/_core/recoveryTargetMapper.ts` — pure fixed logical target mapper;
- `server/_core/recoveryAgentClient.ts` — narrow client abstraction, no real transport;
- `server/_core/fakeRecoveryAgent.ts` — deterministic test-only fake;
- `server/_core/recoveryAgentActionPort.ts` — normalization/timeout/idempotency-defense boundary;
- corresponding `.test.ts` files;
- `server/d011b3c1SafetyBoundary.test.ts` — structural proof of no real side effect.

No Docker/systemd/Kubernetes implementation file is permitted in D-011B.3c.1.

## 14. Explicit boundary to D-011B.3c.2

D-011B.3c.2 is the first delivery allowed to contain a real infrastructure call.

It remains blocked until all of the following are explicitly selected and approved:
1. isolated homologation environment;
2. exact concrete target behind `database-primary-homologation`;
3. real Recovery Agent deployment topology;
4. transport/authentication mechanism;
5. Docker/systemd/other operational mechanism;
6. atomic lease/fencing backend implementation used in the drill;
7. persistent action-store implementation used in the drill;
8. maximum action/transport timeout;
9. operator kill-switch procedure;
10. controlled drill and emergency stop procedure.

Production remains out of scope.

## Acceptance criteria
D-011B.3c.1 is complete only when:
- all contract/fake tests are GREEN;
- structural safety boundary is GREEN;
- security check is GREEN;
- TypeScript is GREEN;
- full regression suite is GREEN;
- build is GREEN;
- code review finds no Critical/Important issue;
- PR is merged and post-merge CI is GREEN;
- no real restart or infrastructure API call exists or has been executed.
