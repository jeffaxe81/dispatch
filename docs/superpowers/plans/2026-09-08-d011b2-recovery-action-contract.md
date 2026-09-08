# D-011B.2 Recovery Action Contract + Simulated Adapter Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir um contrato fechado e testável entre o `RecoveryOrchestrator` e adapters futuros, usando somente um adapter determinístico de simulação e preservando integralmente a barreira de segurança dry-run do D-011B.1.

**Architecture:** O `RecoveryPolicyEngine` continua sendo a única autoridade para permitir `allow_dry_run`. O `RecoveryOrchestrator` transforma uma decisão permitida em um `RecoveryActionRequest` sanitizado e default-deny, invoca um `RecoveryActionPort`, e recebe um `RecoveryActionResult` normalizado; no D-011B.2, a única implementação concreta do port é `SimulatedRecoveryAdapter`. Cenários de success/failure/timeout/cancel existem apenas por injeção do harness em testes, nunca no request de runtime.

**Tech Stack:** TypeScript 5.9, Vitest 2.1, Node.js 24, pnpm 10, arquitetura existente em `server/_core`.

**Spec:** `docs/superpowers/specs/2026-09-08-d011b2-recovery-action-contract-design.md`

## Global Constraints

- D-011B.2 permanece exclusivamente simulado; nenhum restart real pode existir.
- Não importar `child_process`, não usar `exec`, `execFile`, `spawn`, `fork` ou shell.
- Não usar `systemctl`, `service`, Docker, Podman, Kubernetes, hypervisor, cloud SDK, SSH ou APIs de service manager.
- Não importar `runRestore`, `runBackup`, CLI ou adapters de `server/recovery` para o caminho de action execution.
- Não criar endpoint HTTP, CLI, UI, variável de ambiente ou trigger remoto para selecionar cenários de simulação.
- O catálogo de ações é fechado e inicialmente contém somente `restart_component` como intenção sem side effect.
- O `RecoveryActionRequest` não contém comandos, paths executáveis, credenciais, DSNs, tokens, URLs sensíveis, env vars arbitrárias, container IDs, pod UIDs ou detalhes SSH/cloud.
- Somente componentes explicitamente mapeados podem chegar ao adapter; desconhecidos falham fechado antes do port.
- Duplicidade de `actionId` idêntica reaproveita o primeiro resultado em memória e não executa novamente; duplicidade conflitante falha fechado.
- Timeout é bounded por configuração do adapter/harness, não por payload arbitrário de runtime.
- Cancelamento é cooperativo e estritamente in-process; nunca envia sinal ao SO, processo, container ou infraestrutura.
- Não existe retry implícito em timeout/cancel/failure.
- Um componente mantém no máximo uma action in-flight; componentes diferentes podem executar em paralelo.
- Erros brutos nunca vazam para audit/result; stacks, mensagens cruas e payloads de infraestrutura são proibidos.
- In-memory idempotency é aceitável apenas porque D-011B.2 não possui side effects reais; adapter ativo futuro exige coordenação distribuída separada.
- Todos os passos seguem RED -> GREEN -> revisão -> commit.

---

## File Structure Locked for This Plan

- `server/_core/recoveryAction.ts` — catálogo fechado, request/result, reason codes, `RecoveryActionPort` e mapper default-deny.
- `server/_core/recoveryAction.test.ts` — contrato, mapper, allowlist e validações fail-closed.
- `server/_core/simulatedRecoveryAdapter.ts` — única implementação concreta do port; execução puramente in-process.
- `server/_core/simulatedRecoveryAdapter.test.ts` — success/failure/timeout/cancel/idempotência conflitante e sanitização.
- `server/_core/recoveryActionHarness.ts` — factory test-only para injetar cenário determinístico, clock e cancel token cooperativo.
- `server/_core/recoveryOrchestrator.ts` — substitui dependência direta de `DryRunRecoveryExecutor` por `RecoveryActionPort`.
- `server/_core/recoveryOrchestrator.test.ts` — fluxo policy -> mapper -> port -> audit, concorrência e isolamento de erro.
- `server/_core/recoveryBootstrap.ts` — wiring runtime somente com `SimulatedRecoveryAdapter` em cenário fixo seguro de sucesso simulado; nenhum knob remoto.
- `server/_core/recoveryBootstrap.test.ts` — prova do wiring e default-deny.
- `server/d011b2SafetyBoundary.test.ts` — barreira estrutural específica do D-011B.2.
- `server/_core/recoveryDryRunExecutor.ts` — remover somente após migração completa para o novo port.
- `server/_core/recoveryDryRunExecutor.test.ts` — remover junto com o executor legado quando regressões equivalentes estiverem cobertas.

---

### Task 1: RecoveryAction contract + default-deny mapper

**Files:**
- Create: `server/_core/recoveryAction.ts`
- Create: `server/_core/recoveryAction.test.ts`

**Interfaces:**
- Consumes: `RecoveryDecision` and `RecoveryTransitionInput` from `./recoveryPolicy`.
- Produces exactly:

```ts
export type RecoveryActionKind = "restart_component";

export type RecoveryActionReasonCode =
  | "SIMULATED_SUCCESS"
  | "SIMULATED_FAILURE"
  | "SIMULATED_TIMEOUT"
  | "SIMULATED_CANCELLED"
  | "UNKNOWN_COMPONENT"
  | "UNKNOWN_ACTION"
  | "DUPLICATE_ACTION_CONFLICT"
  | "ADAPTER_FAILURE";

export type RecoveryActionRequest = Readonly<{
  actionId: string;
  transitionId: string;
  componentId: string;
  action: RecoveryActionKind;
  requestedAt: string;
  correlationId: string;
}>;

export type RecoveryActionResult = Readonly<{
  actionId: string;
  componentId: string;
  status:
    | "simulated_success"
    | "simulated_failure"
    | "simulated_timeout"
    | "simulated_cancelled";
  reasonCode: RecoveryActionReasonCode;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  correlationId: string;
}>;

export type RecoveryActionPort = {
  execute(request: RecoveryActionRequest): Promise<RecoveryActionResult>;
};

export function mapDecisionToRecoveryAction(input: {
  decision: RecoveryDecision;
  transition: RecoveryTransitionInput;
  now?: Date;
}): RecoveryActionRequest;
```

Default-deny component set in this task:

```ts
const ACTIONABLE_COMPONENTS = new Set(["database", "storage"] as const);
```

`mapDecisionToRecoveryAction` must reject unless `decision.decision === "allow_dry_run"`, the decision and transition component IDs match, and the component is in the explicit set. `actionId` must be deterministic from the already unique decision: `action:${decision.decisionId}`. `correlationId` must equal `decision.decisionId`. `transitionId` must come from the transition input. No scenario selector exists in this type.

- [ ] **Step 1: Write failing contract/mapper tests**

```ts
import { describe, expect, it } from "vitest";
import { mapDecisionToRecoveryAction } from "./recoveryAction";

const now = new Date("2026-09-08T00:00:00.000Z");
const decision = {
  decisionId: "decision-1",
  componentId: "database",
  decision: "allow_dry_run" as const,
  reasonCode: "UNHEALTHY_ELIGIBLE" as const,
  policyVersion: "d011b1-v1" as const,
  attemptNumber: 1,
  cooldownUntil: null,
  createdAt: now.toISOString(),
};
const transition = {
  transitionId: "transition-1",
  componentId: "database",
  from: "healthy" as const,
  to: "unhealthy" as const,
  criticality: "critical" as const,
  occurredAt: now.toISOString(),
};

describe("RecoveryAction contract", () => {
  it("maps an allowed decision to a closed restart_component intention", () => {
    expect(mapDecisionToRecoveryAction({ decision, transition, now })).toEqual({
      actionId: "action:decision-1",
      transitionId: "transition-1",
      componentId: "database",
      action: "restart_component",
      requestedAt: now.toISOString(),
      correlationId: "decision-1",
    });
  });

  it("fails closed for an unknown component before adapter execution", () => {
    expect(() => mapDecisionToRecoveryAction({
      decision: { ...decision, componentId: "unknown-service" },
      transition: { ...transition, componentId: "unknown-service" },
      now,
    })).toThrow("UNKNOWN_COMPONENT");
  });

  it("rejects non executable decisions", () => {
    expect(() => mapDecisionToRecoveryAction({
      decision: { ...decision, decision: "suppress" },
      transition,
      now,
    })).toThrow("RECOVERY_ACTION_NOT_ALLOWED");
  });
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
corepack pnpm vitest run server/_core/recoveryAction.test.ts
```

Expected: FAIL because `./recoveryAction` does not exist.

- [ ] **Step 3: Implement minimal typed contract and mapper**

Implement the exact types above and a mapper with explicit `ACTIONABLE_COMPONENTS`. Throw only stable internal codes (`UNKNOWN_COMPONENT`, `RECOVERY_ACTION_NOT_ALLOWED`, `COMPONENT_MISMATCH`) and never embed input values in error messages.

- [ ] **Step 4: Run focused test and verify GREEN**

```bash
corepack pnpm vitest run server/_core/recoveryAction.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryAction.ts server/_core/recoveryAction.test.ts
git commit -m "feat(d011b2): add recovery action contract"
```

---

### Task 2: SimulatedRecoveryAdapter — deterministic success/failure

**Files:**
- Create: `server/_core/simulatedRecoveryAdapter.ts`
- Create: `server/_core/simulatedRecoveryAdapter.test.ts`

**Interfaces:**
- Consumes: `RecoveryActionPort`, `RecoveryActionRequest`, `RecoveryActionResult`.
- Produces:

```ts
export type SimulationScenario = "success" | "failure" | "timeout" | "cancelled";

export type SimulationClock = {
  now(): Date;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
};

export function createSimulatedRecoveryAdapter(options: {
  scenario: SimulationScenario;
  clock: SimulationClock;
  timeoutMs: number;
  cancellationSignal?: AbortSignal;
}): RecoveryActionPort;
```

Important: `SimulationScenario` belongs only to adapter construction/harness. It must not be added to `RecoveryActionRequest`, env, HTTP, CLI, runtime config, or UI.

- [ ] **Step 1: Write RED tests for success and failure**

```ts
import { describe, expect, it } from "vitest";
import { createSimulatedRecoveryAdapter } from "./simulatedRecoveryAdapter";

const request = {
  actionId: "action:decision-1",
  transitionId: "transition-1",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-08T00:00:00.000Z",
  correlationId: "decision-1",
};

const createClock = () => {
  let ms = Date.parse("2026-09-08T00:00:00.000Z");
  return {
    now: () => new Date(ms),
    sleep: async (delay: number) => { ms += delay; },
  };
};

describe("SimulatedRecoveryAdapter", () => {
  it("returns a deterministic simulated success", async () => {
    const adapter = createSimulatedRecoveryAdapter({ scenario: "success", clock: createClock(), timeoutMs: 1_000 });
    const result = await adapter.execute(request);
    expect(result.status).toBe("simulated_success");
    expect(result.reasonCode).toBe("SIMULATED_SUCCESS");
    expect(result.actionId).toBe(request.actionId);
    expect(result.correlationId).toBe(request.correlationId);
  });

  it("returns a sanitized deterministic simulated failure", async () => {
    const adapter = createSimulatedRecoveryAdapter({ scenario: "failure", clock: createClock(), timeoutMs: 1_000 });
    const result = await adapter.execute(request);
    expect(result.status).toBe("simulated_failure");
    expect(result.reasonCode).toBe("SIMULATED_FAILURE");
    expect(JSON.stringify(result)).not.toContain("stack");
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
corepack pnpm vitest run server/_core/simulatedRecoveryAdapter.test.ts
```

Expected: FAIL because adapter does not exist.

- [ ] **Step 3: Implement minimal success/failure behavior**

The implementation must only use the injected `clock`; it must not import networking, process execution, filesystem mutation, `server/recovery`, Docker or Kubernetes modules. For success/failure, use `await clock.sleep(1)` so duration is deterministic and non-negative.

- [ ] **Step 4: Run and verify GREEN**

```bash
corepack pnpm vitest run server/_core/simulatedRecoveryAdapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/simulatedRecoveryAdapter.ts server/_core/simulatedRecoveryAdapter.test.ts
git commit -m "feat(d011b2): add simulated recovery adapter"
```

---

### Task 3: Timeout + cooperative cancellation

**Files:**
- Modify: `server/_core/simulatedRecoveryAdapter.ts`
- Modify: `server/_core/simulatedRecoveryAdapter.test.ts`

**Interfaces:** Continue using `SimulationClock` and optional in-process `AbortSignal`. No OS signal APIs are allowed.

- [ ] **Step 1: Add RED timeout/cancellation tests**

Add tests proving:

```ts
it("returns simulated_timeout without retrying", async () => {
  let sleeps = 0;
  const clock = {
    now: () => new Date("2026-09-08T00:00:00.000Z"),
    sleep: async () => { sleeps += 1; },
  };
  const adapter = createSimulatedRecoveryAdapter({ scenario: "timeout", clock, timeoutMs: 250 });
  const result = await adapter.execute(request);
  expect(result.status).toBe("simulated_timeout");
  expect(result.reasonCode).toBe("SIMULATED_TIMEOUT");
  expect(sleeps).toBe(1);
});

it("returns simulated_cancelled for cooperative in-process cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  const adapter = createSimulatedRecoveryAdapter({
    scenario: "cancelled",
    clock: createClock(),
    timeoutMs: 250,
    cancellationSignal: controller.signal,
  });
  const result = await adapter.execute(request);
  expect(result.status).toBe("simulated_cancelled");
  expect(result.reasonCode).toBe("SIMULATED_CANCELLED");
});
```

- [ ] **Step 2: Run and verify RED**

```bash
corepack pnpm vitest run server/_core/simulatedRecoveryAdapter.test.ts
```

Expected: FAIL because timeout/cancel semantics are not implemented.

- [ ] **Step 3: Implement minimal bounded semantics**

`timeout` scenario performs exactly one injected sleep bounded by `timeoutMs` and returns `simulated_timeout`. `cancelled` checks only the injected `AbortSignal` and returns `simulated_cancelled`; do not call `process.kill`, emit signals, or add timers/schedulers outside the injected clock.

- [ ] **Step 4: Run and verify GREEN**

```bash
corepack pnpm vitest run server/_core/simulatedRecoveryAdapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/simulatedRecoveryAdapter.ts server/_core/simulatedRecoveryAdapter.test.ts
git commit -m "feat(d011b2): model timeout and cancellation"
```

---

### Task 4: Adapter idempotency by actionId

**Files:**
- Modify: `server/_core/simulatedRecoveryAdapter.ts`
- Modify: `server/_core/simulatedRecoveryAdapter.test.ts`

**Required behavior:** Adapter keeps an in-memory map `actionId -> { fingerprint, resultPromise }`. Fingerprint is deterministic over the safe request fields: `transitionId|componentId|action|correlationId`. Same `actionId` + same fingerprint returns the original promise/result. Same `actionId` + different fingerprint throws stable `DUPLICATE_ACTION_CONFLICT` before another simulation occurs.

- [ ] **Step 1: Add RED tests for identical and conflicting duplicates**

```ts
it("reuses the first result for an identical duplicate actionId", async () => {
  let calls = 0;
  const clock = {
    now: () => new Date("2026-09-08T00:00:00.000Z"),
    sleep: async () => { calls += 1; },
  };
  const adapter = createSimulatedRecoveryAdapter({ scenario: "success", clock, timeoutMs: 250 });
  const first = await adapter.execute(request);
  const second = await adapter.execute({ ...request });
  expect(second).toEqual(first);
  expect(calls).toBe(1);
});

it("fails closed for a conflicting duplicate actionId", async () => {
  const adapter = createSimulatedRecoveryAdapter({ scenario: "success", clock: createClock(), timeoutMs: 250 });
  await adapter.execute(request);
  await expect(adapter.execute({ ...request, componentId: "storage" })).rejects.toThrow("DUPLICATE_ACTION_CONFLICT");
});
```

- [ ] **Step 2: Run and verify RED**

```bash
corepack pnpm vitest run server/_core/simulatedRecoveryAdapter.test.ts
```

- [ ] **Step 3: Implement in-memory idempotency**

Store the promise before awaiting it so concurrent identical calls cannot duplicate execution. Never persist raw exceptions or unsafe payloads.

- [ ] **Step 4: Run and verify GREEN**

```bash
corepack pnpm vitest run server/_core/simulatedRecoveryAdapter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/_core/simulatedRecoveryAdapter.ts server/_core/simulatedRecoveryAdapter.test.ts
git commit -m "feat(d011b2): add action idempotency"
```

---

### Task 5: Test-only RecoveryActionHarness

**Files:**
- Create: `server/_core/recoveryActionHarness.ts`
- Create: `server/_core/recoveryActionHarness.test.ts`

**Interfaces:**

```ts
export function createRecoveryActionHarness(options?: {
  scenario?: SimulationScenario;
  startAt?: string;
  timeoutMs?: number;
}): {
  port: RecoveryActionPort;
  advance(ms: number): void;
  cancel(): void;
};
```

This module must be imported only by tests or by adapter-focused test factories. It must not be imported by `server/_core/index.ts` or runtime bootstrap.

- [ ] **Step 1: Write RED harness determinism test**

```ts
it("controls scenario, time and cooperative cancellation without runtime knobs", async () => {
  const harness = createRecoveryActionHarness({ scenario: "success", startAt: "2026-09-08T00:00:00.000Z" });
  const result = await harness.port.execute(request);
  expect(result.status).toBe("simulated_success");
  expect(result.startedAt).toBe("2026-09-08T00:00:00.000Z");
});
```

Also add a static source assertion that `recoveryBootstrap.ts` and `index.ts` do not import `recoveryActionHarness`.

- [ ] **Step 2: Run and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryActionHarness.test.ts
```

- [ ] **Step 3: Implement harness**

Implement a local mutable clock and local `AbortController`. Do not read `process.env`, args, HTTP input, config files, network state, or OS state.

- [ ] **Step 4: Run and verify GREEN**

```bash
corepack pnpm vitest run server/_core/recoveryActionHarness.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryActionHarness.ts server/_core/recoveryActionHarness.test.ts
git commit -m "test(d011b2): add deterministic action harness"
```

---

### Task 6: Migrate RecoveryOrchestrator to RecoveryActionPort

**Files:**
- Modify: `server/_core/recoveryOrchestrator.ts`
- Modify: `server/_core/recoveryOrchestrator.test.ts`

**Interfaces:**
- Replace `executor: DryRunRecoveryExecutor` with `actionPort: RecoveryActionPort`.
- Call `mapDecisionToRecoveryAction({ decision, transition: input, now })` only after policy returns `allow_dry_run` and after existing per-component in-flight check.
- Extend audit with action metadata while keeping old policy/circuit events.

Update `RecoveryAuditEvent` to add optional safe fields:

```ts
actionId?: string;
action?: "restart_component";
actionStatus?: RecoveryActionResult["status"];
actionReasonCode?: RecoveryActionResult["reasonCode"];
correlationId?: string;
durationMs?: number;
```

Add event names:

```ts
| "recovery_action_started"
| "recovery_action_completed"
| "recovery_action_rejected"
```

Do not include raw error messages.

- [ ] **Step 1: Write RED orchestrator port tests**

Add tests proving:
- `suppress` and `escalate` never call `actionPort.execute`;
- `allow_dry_run` maps to exactly one port call;
- unknown component mapper rejection does not call the port and emits sanitized `recovery_action_rejected`;
- adapter throw is caught and does not propagate to caller/watchdog;
- `inProgress` is released after success/failure/timeout/cancel/throw;
- same component is serialized; different components can run concurrently;
- action completion audit contains IDs/status/reason/duration but no raw exception text.

Example adapter spy:

```ts
const calls: RecoveryActionRequest[] = [];
const actionPort: RecoveryActionPort = {
  async execute(request) {
    calls.push(request);
    return {
      actionId: request.actionId,
      componentId: request.componentId,
      status: "simulated_success",
      reasonCode: "SIMULATED_SUCCESS",
      startedAt: now.toISOString(),
      finishedAt: now.toISOString(),
      durationMs: 0,
      correlationId: request.correlationId,
    };
  },
};
```

- [ ] **Step 2: Run and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryOrchestrator.test.ts
```

Expected: FAIL because orchestrator still expects `executor`.

- [ ] **Step 3: Implement minimal port integration**

Preserve current policy/circuit logic. The action mapper and port call belong only in the `allow_dry_run` path. Catch mapper/adapter errors locally and emit stable sanitized audit events. Always release `inProgress` in `finally` once acquired.

- [ ] **Step 4: Run D-011B.1 + orchestrator regressions**

```bash
corepack pnpm vitest run \
  server/_core/recoveryPolicy.test.ts \
  server/_core/recoveryOrchestrator.test.ts \
  server/_core/recoveryHealthyConfirmation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryOrchestrator.ts server/_core/recoveryOrchestrator.test.ts
git commit -m "refactor(d011b2): route recovery through action port"
```

---

### Task 7: Runtime bootstrap with only SimulatedRecoveryAdapter

**Files:**
- Modify: `server/_core/recoveryBootstrap.ts`
- Modify: `server/_core/recoveryBootstrap.test.ts`

**Runtime rule:** Production bootstrap must construct `SimulatedRecoveryAdapter` directly with a fixed simulation-only runtime scenario. It must not import `RecoveryActionHarness`, read an env scenario, expose a runtime scenario selector, or add external triggers.

Define a local runtime clock:

```ts
const runtimeSimulationClock: SimulationClock = {
  now: () => new Date(),
  sleep: async () => undefined,
};
```

Construct:

```ts
const actionPort = createSimulatedRecoveryAdapter({
  scenario: "success",
  clock: runtimeSimulationClock,
  timeoutMs: 1_000,
});
```

Return `{ store, engine, actionPort, orchestrator }` from the runtime factory.

- [ ] **Step 1: Write RED bootstrap tests**

Prove:
- factory returns `actionPort` instead of legacy `executor`;
- orchestrator can process an allowlisted unhealthy transition and only yields simulated action audit;
- source does not import harness;
- source does not reference `process.env` for recovery scenario/action selection;
- unknown components still fail closed.

- [ ] **Step 2: Run and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryBootstrap.test.ts
```

- [ ] **Step 3: Implement minimal runtime wiring**

Replace `createDryRunRecoveryExecutor()` with `createSimulatedRecoveryAdapter()` and pass `actionPort` to orchestrator. Do not change `HealthWatchdog` scheduling or readiness semantics.

- [ ] **Step 4: Run runtime regression tests**

```bash
corepack pnpm vitest run \
  server/_core/recoveryBootstrap.test.ts \
  server/_core/operationalHealthRuntime.test.ts \
  server/_core/healthWatchdog.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryBootstrap.ts server/_core/recoveryBootstrap.test.ts
git commit -m "feat(d011b2): wire simulated action port"
```

---

### Task 8: Remove legacy DryRunRecoveryExecutor seam

**Files:**
- Delete: `server/_core/recoveryDryRunExecutor.ts`
- Delete: `server/_core/recoveryDryRunExecutor.test.ts`
- Modify tests/imports that still reference the legacy seam.

**Precondition:** Tasks 1-7 must be GREEN and all behaviors formerly protected by `recoveryDryRunExecutor.test.ts` must be covered by `recoveryAction.test.ts`, `simulatedRecoveryAdapter.test.ts`, and `recoveryOrchestrator.test.ts`.

- [ ] **Step 1: Prove no runtime references remain**

Run:

```bash
git grep -n "recoveryDryRunExecutor\|DryRunRecoveryExecutor\|createDryRunRecoveryExecutor" -- server ':!server/_core/recoveryDryRunExecutor.ts' ':!server/_core/recoveryDryRunExecutor.test.ts'
```

Expected: no output.

- [ ] **Step 2: Delete legacy files**

```bash
git rm server/_core/recoveryDryRunExecutor.ts server/_core/recoveryDryRunExecutor.test.ts
```

- [ ] **Step 3: Run focused recovery suite**

```bash
corepack pnpm vitest run \
  server/_core/recoveryAction.test.ts \
  server/_core/simulatedRecoveryAdapter.test.ts \
  server/_core/recoveryOrchestrator.test.ts \
  server/_core/recoveryBootstrap.test.ts \
  server/_core/recoveryPolicy.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A server/_core
git commit -m "refactor(d011b2): retire legacy dry-run executor"
```

---

### Task 9: D-011B.2 structural safety boundary

**Files:**
- Create: `server/d011b2SafetyBoundary.test.ts`
- Keep: `server/d011b1SafetyBoundary.test.ts` unchanged unless a path rename requires a narrow update.

**Required scan scope:** actual implementation files only:
- `server/_core/recoveryAction.ts`
- `server/_core/simulatedRecoveryAdapter.ts`
- `server/_core/recoveryOrchestrator.ts`
- `server/_core/recoveryBootstrap.ts`

**Forbidden patterns:**
- imports/requires of `child_process`;
- `exec(`, `execFile(`, `spawn(`, `fork(`;
- command construction for `systemctl`, `service`, `docker`, `podman`, `kubectl`;
- Docker/Kubernetes SDK imports;
- automatic imports from `server/recovery`;
- `process.kill`;
- generic fields named `command`, `shellCommand`, `executable`, `containerId`, `podUid`, `sshHost` in action contract;
- import of `recoveryActionHarness` from runtime bootstrap/index;
- new `setInterval`/scheduler loop in action/orchestrator/bootstrap implementation.

- [ ] **Step 1: Add structural test**

Use `readFileSync` over the exact four files and explicit regex checks. Read `recoveryAction.ts` separately to assert the request type source does not contain the generic unsafe field names. Read `recoveryBootstrap.ts` and `index.ts` to assert they do not import `recoveryActionHarness`.

- [ ] **Step 2: Run safety boundary**

```bash
corepack pnpm vitest run server/d011b1SafetyBoundary.test.ts server/d011b2SafetyBoundary.test.ts
```

Expected: PASS immediately if the implementation respected the boundary. If it fails, do not weaken the test to admit active recovery; remove the unsafe capability.

- [ ] **Step 3: Run security check**

```bash
corepack pnpm security:check
```

Expected: PASS with existing security invariants preserved.

- [ ] **Step 4: Commit**

```bash
git add server/d011b2SafetyBoundary.test.ts
git commit -m "test(d011b2): enforce simulated recovery boundary"
```

---

### Task 10: Full regression gate + Draft PR

**Files:** No production changes expected. Only fix issues proven by the gate, one root cause at a time under TDD.

- [ ] **Step 1: Run TypeScript**

```bash
corepack pnpm check
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

```bash
corepack pnpm test
```

Expected: all test files and tests PASS, including D-011A, D-011B.1, `server/recovery`, and D-011B.2.

- [ ] **Step 3: Run build**

```bash
corepack pnpm build
```

Expected: exit 0. Existing non-blocking Vite warnings may remain, but no new D-011B.2 warning/error is acceptable.

- [ ] **Step 4: Run security check again on exact head**

```bash
corepack pnpm security:check
```

Expected: PASS.

- [ ] **Step 5: Review requirements line-by-line**

Confirm all of these before PR promotion:
- only `restart_component` semantic action exists;
- only concrete runtime adapter is `SimulatedRecoveryAdapter`;
- no scenario selector in runtime request/env/HTTP/UI/CLI;
- unknown component is default-deny;
- same actionId identical request is idempotent;
- conflicting duplicate fails closed;
- success/failure/timeout/cancel are deterministic and sanitized;
- no implicit retry;
- per-component in-flight guard remains;
- different components may simulate concurrently;
- audit contains safe action metadata only;
- no real recovery capability exists;
- `server/recovery` remains decoupled;
- no new scheduler was added;
- D-011A and D-011B.1 regressions remain green.

- [ ] **Step 6: Create PR as Draft**

Create against `main`, title:

```text
D-011B.2 — Recovery Action Contract + Simulated Adapter Harness
```

Body must state explicitly that the PR is simulation-only and contains no real restart/failover/rollback/restore/migration capability.

- [ ] **Step 7: Require exact-head CI**

Do not accept a synthetic merge-ref run as the only evidence. Verify the quality workflow checks out the exact PR head SHA and passes security, TypeScript, full suite, and build on that SHA.

- [ ] **Step 8: Final code review**

Review the complete PR diff for Critical/Important findings. Any finding returns to RED -> GREEN before PR leaves Draft.

- [ ] **Step 9: Human merge gate**

Only after all gates are GREEN and final review has no Critical/Important findings may the PR become Ready for review. Merge remains a separate explicit human decision. Never delete the branch automatically.

---

## Final Verification Matrix

| Gate | Evidence required |
|---|---|
| Contract | Closed action kind, sanitized immutable request/result, no arbitrary command field |
| Default deny | Unknown component/action rejected before port invocation |
| Simulation | success/failure/timeout/cancel deterministic, no side effects |
| Idempotency | identical duplicate reuses result; conflicting duplicate rejects |
| Concurrency | one in-flight action per component; different components concurrent |
| Audit | stable IDs/status/reason/duration; no raw errors/secrets |
| Runtime | only SimulatedRecoveryAdapter, fixed simulation-only construction, no scenario knob |
| Safety | D-011B.1 + D-011B.2 structural boundaries GREEN |
| Disaster recovery separation | no automatic coupling to `server/recovery` |
| Regression | security + TypeScript + full tests + build GREEN on exact head |
| Review | no Critical/Important findings |
| Integration | explicit human authorization + post-merge GREEN on `main` |
