# D-011B.3c.1 Recovery Agent Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o contrato fechado do Recovery Agent, target mapping fixo, fake test-only, action port sem side effect real e barreiras estruturais para preparar o futuro D-011B.3c.2 sem qualquer restart real.

**Architecture:** O fluxo ativo existente permanece `RecoveryPolicyEngine -> RecoveryOrchestrator -> ActiveRecoveryAuthorizationGate -> RecoveryActiveCoordinator`. D-011B.3c.1 adiciona um boundary fechado `RecoveryAgentActionPort -> RecoveryAgentClient`, mas nesta entrega o único agente concreto é um fake in-process em `server/_core/testing`, usado apenas por testes. Nenhuma biblioteca Docker/systemd/Kubernetes, socket, shell ou transporte real é permitida.

**Tech Stack:** TypeScript 5.9, Vitest 2.1, Node.js 24, pnpm 10, arquitetura `server/_core` existente.

**Spec:** `docs/superpowers/specs/2026-09-08-d011b3c1-recovery-agent-contract-design.md`

## Global Constraints

- Ambiente semântico permitido: `homologation-controlled`.
- Componente lógico permitido: `database`.
- Ação permitida: `restart_component`.
- Target alias fixo: `database-primary-homologation`.
- Active recovery continua OFF por padrão.
- Produção explicitamente negada.
- D-011B.3c.1 é 100% sem side effect real.
- Nenhum Docker/systemd/Kubernetes/Podman/SSH/hypervisor/cloud SDK.
- Nenhum `child_process`, `exec`, `spawn`, `fork`, `execFile`.
- Nenhum acesso a `/var/run/docker.sock`.
- Nenhum import automático de `server/recovery`.
- Nenhum comando, argumento, host, endpoint, unit/container/pod id, script ou target operacional vindo de payload não confiável.
- Nenhum retry implícito.
- Timeout/ambiguidade -> `unknown_outcome`; nunca auto-retry.
- Fencing token deve ser inteiro positivo.
- Fake agent vive somente em `server/_core/testing/` e produção/bootstrap não pode importá-lo.
- Nenhuma rota HTTP/UI/CLI pode invocar o agent client diretamente.
- RED -> GREEN -> revisão -> commit por task.

---

## File Structure Locked for This Plan

### Production-safe contract modules
- `server/_core/recoveryAgentProtocol.ts` — request/response fechados e validação runtime.
- `server/_core/recoveryTargetMapper.ts` — mapping puro e fixo `database -> database-primary-homologation`.
- `server/_core/recoveryAgentClient.ts` — interface estreita do client, sem transporte real.
- `server/_core/recoveryAgentActionPort.ts` — prepara request, chama client, aplica timeout/normalização e no-retry.

### Test-only support
- `server/_core/testing/fakeRecoveryAgent.ts` — fake determinístico in-process.

### Tests
- `server/_core/recoveryAgentProtocol.test.ts`
- `server/_core/recoveryTargetMapper.test.ts`
- `server/_core/recoveryAgentClient.test.ts`
- `server/_core/testing/fakeRecoveryAgent.test.ts`
- `server/_core/recoveryAgentActionPort.test.ts`
- `server/d011b3c1SafetyBoundary.test.ts`

No Docker/systemd/Kubernetes implementation file is permitted.

---

### Task 1: Closed Recovery Agent protocol

**Files:**
- Create: `server/_core/recoveryAgentProtocol.ts`
- Create: `server/_core/recoveryAgentProtocol.test.ts`

**Interfaces:**

```ts
export type RecoveryAgentOutcome =
  | "accepted_completed"
  | "explicit_failure"
  | "timeout_unknown"
  | "rejected_stale_fence"
  | "rejected_target"
  | "rejected_protocol"
  | "rejected_untrusted_client"
  | "duplicate_conflict";

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

export type RecoveryAgentResponse = Readonly<{
  outcome: RecoveryAgentOutcome;
  actionId: string;
  fencingToken: number;
  startedAt: string | null;
  completedAt: string | null;
}>;

export function validateRecoveryAgentRequest(input: unknown): RecoveryAgentRequest;
export function validateRecoveryAgentResponse(input: unknown): RecoveryAgentResponse;
```

- [ ] **Step 1: Write failing protocol tests**

Add tests that prove:
- valid approved request passes;
- wrong protocol fails closed;
- malformed/zero/negative/non-integer fence fails;
- runtime malformed component/action/target is rejected;
- arbitrary fields such as `command`, `args`, `containerId`, `host`, `endpoint`, `script` do not become part of the validated output;
- response validator accepts only normalized outcomes.

- [ ] **Step 2: Run RED**

Run:
```bash
corepack pnpm vitest run server/_core/recoveryAgentProtocol.test.ts
```
Expected: FAIL because `recoveryAgentProtocol.ts` does not exist.

- [ ] **Step 3: Implement minimal closed validators**

Use explicit runtime checks. Do not accept a generic `string` action/target after validation.

- [ ] **Step 4: Run GREEN**

Run:
```bash
corepack pnpm vitest run server/_core/recoveryAgentProtocol.test.ts
corepack pnpm check
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryAgentProtocol.ts server/_core/recoveryAgentProtocol.test.ts
git commit -m "feat: add recovery agent protocol contract"
```

---

### Task 2: Trusted fixed target mapper

**Files:**
- Create: `server/_core/recoveryTargetMapper.ts`
- Create: `server/_core/recoveryTargetMapper.test.ts`

**Interfaces:**

```ts
export type RecoveryTargetAlias = "database-primary-homologation";

export function mapRecoveryTarget(input: Readonly<{
  componentId: string;
  action: string;
  environment: string;
}>): RecoveryTargetAlias;
```

Required rules:
- only `homologation-controlled` + `database` + `restart_component` maps;
- any other environment/component/action throws/fails closed;
- no payload target alias is accepted as input;
- no discovery/network/filesystem access.

- [ ] **Step 1: Write RED tests**
- [ ] **Step 2: Run focused RED**
- [ ] **Step 3: Implement pure fixed mapping**
- [ ] **Step 4: Run focused GREEN + TypeScript**
- [ ] **Step 5: Commit**

Expected commands:
```bash
corepack pnpm vitest run server/_core/recoveryTargetMapper.test.ts
corepack pnpm check
```

---

### Task 3: Narrow RecoveryAgentClient abstraction

**Files:**
- Create: `server/_core/recoveryAgentClient.ts`
- Create: `server/_core/recoveryAgentClient.test.ts`

**Interfaces:**

```ts
import type { RecoveryAgentRequest, RecoveryAgentResponse } from "./recoveryAgentProtocol";

export type RecoveryAgentClient = {
  invoke(request: RecoveryAgentRequest): Promise<RecoveryAgentResponse>;
};

export type RecoveryAgentAuthVerifier = {
  isTrustedClient(): boolean;
};
```

No HTTP/fetch/axios/socket implementation in this task.

Tests must prove the exported surface contains no transport configuration, URL, headers, token, command, target id, host or retry count fields.

- [ ] Write RED tests.
- [ ] Confirm RED.
- [ ] Implement type-only/narrow helpers if needed.
- [ ] Confirm GREEN + `pnpm check`.
- [ ] Commit.

---

### Task 4: Test-only FakeRecoveryAgent

**Files:**
- Create: `server/_core/testing/fakeRecoveryAgent.ts`
- Create: `server/_core/testing/fakeRecoveryAgent.test.ts`

**Interfaces:**

```ts
import type { RecoveryAgentClient, RecoveryAgentAuthVerifier } from "../recoveryAgentClient";

export type FakeRecoveryScenario =
  | "success"
  | "explicit_failure"
  | "timeout_unknown"
  | "stale_fence"
  | "wrong_target"
  | "wrong_protocol";

export function createFakeRecoveryAgent(options: Readonly<{
  scenario: FakeRecoveryScenario;
  currentFence: number;
  auth: RecoveryAgentAuthVerifier;
}>): RecoveryAgentClient;
```

Behavior:
- untrusted client -> `rejected_untrusted_client`;
- lower fencing token -> `rejected_stale_fence`;
- success -> `accepted_completed`;
- explicit failure -> `explicit_failure`;
- timeout scenario remains pending/throws a dedicated test-only timeout signal consumed by the action-port timeout test;
- wrong target/protocol -> corresponding rejection;
- same `actionId` + identical immutable identity -> reuse original result/promise;
- same `actionId` + conflicting identity -> `duplicate_conflict` without second execution.

The fake must have a test-visible execution counter so tests can prove no double execution. That counter is test-support only.

- [ ] Write RED tests for all scenarios, auth and duplicate semantics.
- [ ] Confirm RED due to missing fake.
- [ ] Implement fake only under `testing/`.
- [ ] Confirm GREEN.
- [ ] Commit.

---

### Task 5: RecoveryAgentActionPort — preparation and normalization

**Files:**
- Create: `server/_core/recoveryAgentActionPort.ts`
- Create: `server/_core/recoveryAgentActionPort.test.ts`

**Interfaces:**

```ts
import type { RecoveryActionRequest, RecoveryActionResult } from "./recoveryAction";
import type { RecoveryAgentClient } from "./recoveryAgentClient";
import type { RecoveryLease } from "./recoveryLease";

export type RecoveryAgentClock = {
  now(): Date;
  timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T>;
};

export function createRecoveryAgentActionPort(options: Readonly<{
  client: RecoveryAgentClient;
  clock: RecoveryAgentClock;
  timeoutMs: number;
  environment: "homologation-controlled";
}>): {
  execute(input: Readonly<{
    action: RecoveryActionRequest;
    decisionId: string;
    lease: RecoveryLease;
  }>): Promise<RecoveryActionResult>;
};
```

Required behavior:
- validate action/lease identity before client call;
- call `mapRecoveryTarget` internally;
- construct closed protocol request;
- exactly one `client.invoke` attempt;
- no retry;
- accepted -> normalized simulated/active-safe success representation chosen consistently with existing `RecoveryActionResult` contract without claiming verified recovery;
- explicit/rejected -> normalized failure/rejection reason code;
- timeout/transport ambiguity -> normalized unknown outcome reason code with no retry;
- raw exception text never emitted.

If the existing `RecoveryActionResult` union cannot represent `unknown_outcome` without semantic distortion, stop at this gate and extend the contract in a separate RED->GREEN change within this task before integrating the port. Do not silently map uncertainty to success/failure.

Tests must include a client spy proving invoke count is exactly 1 on timeout/failure.

- [ ] Write failing tests.
- [ ] Run RED.
- [ ] Implement minimal port.
- [ ] Run focused GREEN + TypeScript.
- [ ] Commit.

---

### Task 6: Fencing + idempotency defense integration tests

**Files:**
- Modify: `server/_core/recoveryAgentActionPort.test.ts`
- Modify: `server/_core/testing/fakeRecoveryAgent.test.ts`

Add cross-boundary tests proving:
- stale fence never produces an accepted result;
- current fence succeeds in fake only;
- duplicate identical action executes fake once;
- duplicate conflict never executes second time;
- timeout unknown never retries;
- target mismatch is rejected before fake execution where mapper catches it;
- production environment cannot be constructed through the typed factory/runtime guard.

This task should require no production change if Tasks 1-5 are correct. If it exposes a bug, fix only the smallest responsible module.

- [ ] Add RED/coverage tests.
- [ ] Run focused suite.
- [ ] Fix minimal root cause if needed.
- [ ] Re-run GREEN.
- [ ] Commit.

---

### Task 7: D-011B.3c.1 structural safety boundary

**Files:**
- Create: `server/d011b3c1SafetyBoundary.test.ts`

Scan production files:
- `server/_core/recoveryAgentProtocol.ts`
- `server/_core/recoveryTargetMapper.ts`
- `server/_core/recoveryAgentClient.ts`
- `server/_core/recoveryAgentActionPort.ts`

Forbidden strings/import patterns include:
- `child_process`, `exec(`, `spawn(`, `fork(`, `execFile(`;
- `/var/run/docker.sock`, Docker client packages;
- `systemctl`, systemd DBus;
- Kubernetes/Podman/SSH/hypervisor/cloud control clients;
- `server/recovery` imports;
- generic unsafe contract fields `command`, `args`, `containerId`, `unitName`, `podName`, `host`, `endpoint`, `script`;
- production import of `/testing/fakeRecoveryAgent`;
- direct route/controller/UI/CLI imports of `recoveryAgentClient` or `recoveryAgentActionPort`;
- new scheduler/`setInterval` loops.

Also assert:
- `server/_core/index.ts` does not import fake test-support;
- `activeRecoveryBootstrap.ts` does not import fake test-support or expose a scenario selector;
- existing D-011B.1/B.2/B.3a-b safety boundaries remain GREEN.

- [ ] Write boundary test.
- [ ] Run all recovery safety boundaries + security check.
- [ ] Fix production only if the boundary reveals a real violation; do not weaken assertions to fit code.
- [ ] Commit.

Commands:
```bash
corepack pnpm vitest run server/d011b1SafetyBoundary.test.ts server/d011b2SafetyBoundary.test.ts server/d011b3abSafetyBoundary.test.ts server/d011b3c1SafetyBoundary.test.ts
corepack pnpm security:check
```

---

### Task 8: Full regression, review and Draft PR gate

Run on the exact branch head:

```bash
corepack pnpm check
corepack pnpm test
corepack pnpm build
corepack pnpm security:check
```

Required evidence:
- all tests GREEN;
- TypeScript GREEN;
- build GREEN;
- security GREEN;
- all D-011 safety boundaries GREEN;
- no real infrastructure dependency/import introduced;
- no fake imported by production bootstrap;
- no hidden retry;
- no transport implementation;
- no restart real executed.

Open/maintain Draft PR:

Title:
`D-011B.3c.1 — Recovery Agent Contract + Fake Harness`

Body must state explicitly:
- test/fake only;
- no Docker/systemd/Kubernetes call;
- no real restart;
- production denied/default-off;
- D-011B.3c.2 remains separately gated.

Perform final code review against the spec. No Critical/Important findings may remain before Ready.

Only after exact-head CI + review GREEN:
- mark PR Ready;
- do not merge automatically;
- do not delete branch.

---

## Explicit non-deliverables

The following are not part of this plan and must not be implemented:
- real Recovery Agent service/process;
- HTTP/gRPC/Unix socket transport;
- mTLS/HMAC/token credentials;
- Docker socket/API call;
- systemd DBus/systemctl call;
- Kubernetes API call;
- concrete operational target/container/unit mapping behind the alias;
- active runtime wiring to real adapter;
- production activation;
- real restart drill;
- D-011B.3d post-action verifier.

All of those remain for separately-approved future work, primarily D-011B.3c.2 and D-011B.3d.
