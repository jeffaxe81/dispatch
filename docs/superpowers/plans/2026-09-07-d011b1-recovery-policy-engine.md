# D-011B.1 Recovery Policy Engine + Dry-Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar um motor de política de autorrecuperação em modo exclusivamente dry-run, com allowlist, cooldown, limite de tentativas, circuit breaker, idempotência, concorrência por componente e observabilidade sanitizada, sem qualquer capacidade real de restart.

**Architecture:** O `HealthWatchdog` do D-011A continua sendo a única camada de detecção/histerese. As transições sanitizadas seguem para um `RecoveryOrchestrator`, que consulta um `RecoveryPolicyEngine` com estado em `RecoveryPolicyStore`; somente decisões `allow_dry_run` chegam ao `DryRunRecoveryExecutor`. O wiring acontece no runtime operacional existente, sem criar scheduler adicional e sem importar `server/recovery`.

**Tech Stack:** TypeScript 5.9, Vitest 2.1, Node.js 24, Express 4, pnpm 10, arquitetura atual em `server/_core`.

**Spec:** `docs/superpowers/specs/2026-09-07-d011b1-recovery-policy-engine-design.md`

## Global Constraints

- D-011B.1 é exclusivamente `dry_run`; nenhum restart real pode existir.
- Não importar `child_process`, Docker, Kubernetes, systemd, PM2, SSH, cloud SDKs ou adapters de infraestrutura.
- Não importar `runRestore`, `runBackup`, CLI ou adapters de `server/recovery`.
- `unknown` e `degraded` nunca autorizam recovery nesta fase.
- Ausência de allowlist explícita significa `suppress`.
- Cooldown default: 30 segundos.
- Máximo: 3 tentativas permitidas em janela deslizante de 15 minutos; a 4ª tentativa elegível abre o recovery circuit e retorna `escalate`.
- Enquanto o recovery circuit estiver aberto, novas falhas não incrementam o contador de tentativas.
- O circuit fecha somente após 2 observações `healthy` consecutivas registradas pelo motor de política.
- O recovery circuit é separado do health state e do readiness.
- Falhas internas do D-011B devem ser fail-closed e nunca derrubar o watchdog, `/health/live` ou `/health/ready`.
- Logs e eventos devem ser sanitizados; nenhuma mensagem crua de exceção, stack, credencial, SQL, cookie, header de autenticação ou PII desnecessária.
- Todos os passos seguem RED -> GREEN -> revisão -> commit.

---

## File Structure Locked for This Plan

- `server/_core/recoveryPolicy.ts` — tipos, defaults, validação de política e decisão pura baseada no estado do store.
- `server/_core/recoveryPolicyStore.ts` — contrato e implementação in-memory do estado por componente.
- `server/_core/recoveryPolicy.test.ts` — TDD do motor de decisão, limites e circuit breaker.
- `server/_core/recoveryDryRunExecutor.ts` — executor sem side effects e tipos de resultado.
- `server/_core/recoveryDryRunExecutor.test.ts` — garante modo dry-run e ausência de execução real.
- `server/_core/recoveryOrchestrator.ts` — coordenação, idempotência e trava de concorrência por componente.
- `server/_core/recoveryOrchestrator.test.ts` — TDD do fluxo decisão -> execução -> auditoria.
- `server/_core/operationalHealthRuntime.ts` — wiring mínimo no callback de transição existente.
- `server/_core/operationalHealthRuntime.test.ts` — regressão e idempotência do runtime.
- `server/_core/index.ts` — configuração explícita do D-011B.1, ainda em dry-run.
- `server/d011b1SafetyBoundary.test.ts` — teste estrutural que falha se capacidades reais proibidas entrarem no escopo.

---

### Task 1: RecoveryPolicyStore in-memory

**Files:**
- Create: `server/_core/recoveryPolicyStore.ts`
- Test: `server/_core/recoveryPolicy.test.ts`

**Interfaces:**
- Produces:
  - `RecoveryComponentState`
  - `RecoveryPolicyStore`
  - `createInMemoryRecoveryPolicyStore()`

Use exatamente:

```ts
export type RecoveryComponentState = {
  attemptTimestamps: number[];
  cooldownUntilMs: number | null;
  circuitOpen: boolean;
  healthyStreak: number;
  lastDecisionId: string | null;
  inProgress: boolean;
};

export type RecoveryPolicyStore = {
  get(componentId: string): RecoveryComponentState;
  set(componentId: string, state: RecoveryComponentState): void;
};

export function createInMemoryRecoveryPolicyStore(): RecoveryPolicyStore;
```

- [ ] **Step 1: Write the failing store isolation test**

```ts
import { describe, expect, it } from "vitest";
import { createInMemoryRecoveryPolicyStore } from "./recoveryPolicyStore";

describe("RecoveryPolicyStore", () => {
  it("isolates state per component and returns fail-closed defaults", () => {
    const store = createInMemoryRecoveryPolicyStore();
    const db = store.get("database");
    const storage = store.get("storage");

    expect(db).toEqual({
      attemptTimestamps: [],
      cooldownUntilMs: null,
      circuitOpen: false,
      healthyStreak: 0,
      lastDecisionId: null,
      inProgress: false,
    });
    expect(storage).toEqual(db);

    store.set("database", { ...db, circuitOpen: true });
    expect(store.get("database").circuitOpen).toBe(true);
    expect(store.get("storage").circuitOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
corepack pnpm vitest run server/_core/recoveryPolicy.test.ts
```

Expected: FAIL because `./recoveryPolicyStore` does not exist.

- [ ] **Step 3: Implement the minimal store**

```ts
export type RecoveryComponentState = {
  attemptTimestamps: number[];
  cooldownUntilMs: number | null;
  circuitOpen: boolean;
  healthyStreak: number;
  lastDecisionId: string | null;
  inProgress: boolean;
};

export type RecoveryPolicyStore = {
  get(componentId: string): RecoveryComponentState;
  set(componentId: string, state: RecoveryComponentState): void;
};

const emptyState = (): RecoveryComponentState => ({
  attemptTimestamps: [],
  cooldownUntilMs: null,
  circuitOpen: false,
  healthyStreak: 0,
  lastDecisionId: null,
  inProgress: false,
});

export function createInMemoryRecoveryPolicyStore(): RecoveryPolicyStore {
  const states = new Map<string, RecoveryComponentState>();
  return {
    get(componentId) {
      const current = states.get(componentId) ?? emptyState();
      return {
        ...current,
        attemptTimestamps: [...current.attemptTimestamps],
      };
    },
    set(componentId, state) {
      states.set(componentId, {
        ...state,
        attemptTimestamps: [...state.attemptTimestamps],
      });
    },
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
corepack pnpm vitest run server/_core/recoveryPolicy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryPolicyStore.ts server/_core/recoveryPolicy.test.ts
git commit -m "feat(d011b1): add recovery policy store"
```

---

### Task 2: RecoveryPolicyEngine — eligibility and allowlist

**Files:**
- Create: `server/_core/recoveryPolicy.ts`
- Modify: `server/_core/recoveryPolicy.test.ts`

**Interfaces:**
- Consumes: `RecoveryPolicyStore` from Task 1.
- Produces:

```ts
import type { HealthState, HealthCriticality } from "./healthRegistry";
import type { RecoveryPolicyStore } from "./recoveryPolicyStore";

export type RecoveryReasonCode =
  | "UNHEALTHY_ELIGIBLE"
  | "COMPONENT_NOT_ALLOWLISTED"
  | "STATE_NOT_RECOVERABLE"
  | "COOLDOWN_ACTIVE"
  | "ATTEMPT_LIMIT_REACHED"
  | "RECOVERY_CIRCUIT_OPEN"
  | "DUPLICATE_TRANSITION"
  | "RECOVERY_ALREADY_IN_PROGRESS"
  | "POLICY_DISABLED"
  | "INVALID_TRANSITION";

export type RecoveryDecisionKind = "allow_dry_run" | "suppress" | "escalate";

export type RecoveryTransitionInput = {
  transitionId: string;
  componentId: string;
  from: HealthState;
  to: HealthState;
  criticality: HealthCriticality;
  occurredAt: string;
};

export type RecoveryDecision = {
  decisionId: string;
  componentId: string;
  decision: RecoveryDecisionKind;
  reasonCode: RecoveryReasonCode;
  policyVersion: "d011b1-v1";
  attemptNumber: number;
  cooldownUntil: string | null;
  createdAt: string;
};

export type RecoveryPolicyConfig = {
  enabled: boolean;
  recoverableComponents: ReadonlySet<string>;
  cooldownMs: number;
  attemptWindowMs: number;
  maxAttempts: number;
  healthyCyclesToCloseCircuit: number;
};

export function createRecoveryPolicyEngine(options: {
  store: RecoveryPolicyStore;
  config: RecoveryPolicyConfig;
  createId?: () => string;
}): {
  evaluate(input: RecoveryTransitionInput, now?: Date): RecoveryDecision;
};
```

- [ ] **Step 1: Add failing tests for policy disabled, allowlist, degraded, unknown and healthy**

Add cases asserting:

```ts
expect(engine.evaluate(unhealthyDb, now).decision).toBe("allow_dry_run");
expect(engine.evaluate(unhealthyNonAllowlisted, now)).toMatchObject({
  decision: "suppress",
  reasonCode: "COMPONENT_NOT_ALLOWLISTED",
});
expect(engine.evaluate({ ...unhealthyDb, to: "degraded" }, now)).toMatchObject({
  decision: "suppress",
  reasonCode: "STATE_NOT_RECOVERABLE",
});
expect(engine.evaluate({ ...unhealthyDb, to: "unknown" }, now)).toMatchObject({
  decision: "suppress",
  reasonCode: "STATE_NOT_RECOVERABLE",
});
expect(disabledEngine.evaluate(unhealthyDb, now)).toMatchObject({
  decision: "suppress",
  reasonCode: "POLICY_DISABLED",
});
```

Also verify an invalid transition where `from === to` returns `INVALID_TRANSITION`.

- [ ] **Step 2: Run focused test and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryPolicy.test.ts
```

Expected: FAIL because the engine/types do not exist.

- [ ] **Step 3: Implement minimal eligibility logic**

Implementation rules in this exact order:

```ts
if (!config.enabled) -> suppress/POLICY_DISABLED
if (input.from === input.to) -> suppress/INVALID_TRANSITION
if (!config.recoverableComponents.has(input.componentId)) -> suppress/COMPONENT_NOT_ALLOWLISTED
if (input.to !== "unhealthy") -> suppress/STATE_NOT_RECOVERABLE
otherwise continue to stateful limits and, if none apply, allow_dry_run/UNHEALTHY_ELIGIBLE
```

Validate config at construction: positive finite `cooldownMs`, `attemptWindowMs`, integer positive `maxAttempts`, integer positive `healthyCyclesToCloseCircuit`. Throw only construction-time programmer errors; runtime evaluation remains fail-closed.

- [ ] **Step 4: Run focused test and verify GREEN**

```bash
corepack pnpm vitest run server/_core/recoveryPolicy.test.ts
```

Expected: all current policy tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryPolicy.ts server/_core/recoveryPolicy.test.ts
git commit -m "feat(d011b1): add recovery eligibility policy"
```

---

### Task 3: Cooldown, attempt window and recovery circuit breaker

**Files:**
- Modify: `server/_core/recoveryPolicy.ts`
- Modify: `server/_core/recoveryPolicy.test.ts`

**Interfaces:** Same as Task 2.

- [ ] **Step 1: Add failing tests for cooldown and exact 3/4 attempt semantics**

Use deterministic times:

```ts
const t0 = new Date("2026-09-07T12:00:00.000Z");
const t31 = new Date("2026-09-07T12:00:31.000Z");
const t62 = new Date("2026-09-07T12:01:02.000Z");
const t93 = new Date("2026-09-07T12:01:33.000Z");
```

Assert:

```ts
expect(engine.evaluate(input("tr-1"), t0)).toMatchObject({ decision: "allow_dry_run", attemptNumber: 1 });
expect(engine.evaluate(input("tr-2"), new Date("2026-09-07T12:00:10.000Z"))).toMatchObject({
  decision: "suppress",
  reasonCode: "COOLDOWN_ACTIVE",
  attemptNumber: 1,
});
expect(engine.evaluate(input("tr-2"), t31)).toMatchObject({ decision: "allow_dry_run", attemptNumber: 2 });
expect(engine.evaluate(input("tr-3"), t62)).toMatchObject({ decision: "allow_dry_run", attemptNumber: 3 });
expect(engine.evaluate(input("tr-4"), t93)).toMatchObject({
  decision: "escalate",
  reasonCode: "ATTEMPT_LIMIT_REACHED",
  attemptNumber: 3,
});
```

Then assert a 5th unhealthy transition while circuit is open returns `RECOVERY_CIRCUIT_OPEN` and leaves `attemptNumber` at 3.

- [ ] **Step 2: Run focused test and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryPolicy.test.ts
```

Expected: new limit tests FAIL.

- [ ] **Step 3: Implement pruning and circuit logic**

Use:

```ts
const windowStart = nowMs - config.attemptWindowMs;
const attempts = state.attemptTimestamps.filter(ts => ts >= windowStart);
```

Order after eligibility:

```ts
if (state.circuitOpen) -> suppress/RECOVERY_CIRCUIT_OPEN without changing attempts
if (state.inProgress) -> suppress/RECOVERY_ALREADY_IN_PROGRESS
if (state.cooldownUntilMs !== null && nowMs < state.cooldownUntilMs) -> suppress/COOLDOWN_ACTIVE
if (attempts.length >= config.maxAttempts) {
  set circuitOpen=true;
  return escalate/ATTEMPT_LIMIT_REACHED with attemptNumber=attempts.length;
}
otherwise append nowMs, set cooldownUntilMs=nowMs+cooldownMs and allow
```

`attemptNumber` on allowed decisions equals the new attempt count. Suppressed decisions never increment attempts.

- [ ] **Step 4: Run focused test and verify GREEN**

```bash
corepack pnpm vitest run server/_core/recoveryPolicy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryPolicy.ts server/_core/recoveryPolicy.test.ts
git commit -m "feat(d011b1): enforce recovery limits and circuit"
```

---

### Task 4: Duplicate transition protection and healthy circuit recovery

**Files:**
- Modify: `server/_core/recoveryPolicy.ts`
- Modify: `server/_core/recoveryPolicy.test.ts`

**Interfaces:** Same as Task 2.

- [ ] **Step 1: Add failing duplicate and healthy recovery tests**

Assert that evaluating the same `transitionId` twice produces `DUPLICATE_TRANSITION` on the second call and does not change attempts.

For healthy recovery:

```ts
// after opening circuit
expect(engine.evaluate(healthy("h-1"), h1)).toMatchObject({
  decision: "suppress",
  reasonCode: "STATE_NOT_RECOVERABLE",
});
expect(store.get("database").circuitOpen).toBe(true);
expect(store.get("database").healthyStreak).toBe(1);

expect(engine.evaluate(healthy("h-2"), h2)).toMatchObject({
  decision: "suppress",
  reasonCode: "STATE_NOT_RECOVERABLE",
});
expect(store.get("database").circuitOpen).toBe(false);
expect(store.get("database").healthyStreak).toBe(0);
```

Any non-healthy observation resets `healthyStreak` to 0. Healthy observations never create attempts.

- [ ] **Step 2: Run focused test and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryPolicy.test.ts
```

Expected: duplicate/healthy recovery cases FAIL.

- [ ] **Step 3: Implement exact transition tracking**

Extend `RecoveryComponentState` with:

```ts
lastTransitionId: string | null;
```

Update the empty state and all copies. At the beginning of evaluation, after policy-disabled check but before mutating counters, suppress identical `transitionId` with `DUPLICATE_TRANSITION`.

For `to === "healthy"`, update healthy streak before returning `STATE_NOT_RECOVERABLE`; when streak reaches `healthyCyclesToCloseCircuit`, close circuit and reset attempts/cooldown/streak. Any `to !== "healthy"` resets streak to zero.

- [ ] **Step 4: Run focused test and verify GREEN**

```bash
corepack pnpm vitest run server/_core/recoveryPolicy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryPolicyStore.ts server/_core/recoveryPolicy.ts server/_core/recoveryPolicy.test.ts
git commit -m "feat(d011b1): add recovery idempotency and circuit recovery"
```

---

### Task 5: DryRunRecoveryExecutor

**Files:**
- Create: `server/_core/recoveryDryRunExecutor.ts`
- Create: `server/_core/recoveryDryRunExecutor.test.ts`

**Interfaces:**
- Consumes: `RecoveryDecision`.
- Produces:

```ts
export type RecoveryActionType = "restart_component";

export type DryRunRecoveryResult = {
  decisionId: string;
  componentId: string;
  mode: "dry_run";
  outcome: "simulated" | "skipped" | "rejected";
  actionType: RecoveryActionType;
  startedAt: string;
  completedAt: string;
};

export type DryRunRecoveryExecutor = {
  execute(decision: RecoveryDecision, now?: Date): Promise<DryRunRecoveryResult>;
};

export function createDryRunRecoveryExecutor(): DryRunRecoveryExecutor;
```

- [ ] **Step 1: Write failing dry-run tests**

Tests must assert:

```ts
const result = await executor.execute(allowedDecision, now);
expect(result).toMatchObject({
  decisionId: allowedDecision.decisionId,
  componentId: allowedDecision.componentId,
  mode: "dry_run",
  outcome: "simulated",
  actionType: "restart_component",
});
```

And a `suppress` or `escalate` decision must reject with a typed/sanitized error whose message contains no raw input payload.

- [ ] **Step 2: Run focused test and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryDryRunExecutor.test.ts
```

Expected: FAIL because executor does not exist.

- [ ] **Step 3: Implement executor with no side effects**

The file may import only local types and standard date/string logic. It must not import any process-control or infrastructure module. `execute()` accepts only `allow_dry_run`; otherwise throw `new Error("Recovery decision is not executable in dry-run mode.")`.

- [ ] **Step 4: Run focused test and verify GREEN**

```bash
corepack pnpm vitest run server/_core/recoveryDryRunExecutor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryDryRunExecutor.ts server/_core/recoveryDryRunExecutor.test.ts
git commit -m "feat(d011b1): add dry-run recovery executor"
```

---

### Task 6: RecoveryOrchestrator — decision, concurrency and sanitized audit

**Files:**
- Create: `server/_core/recoveryOrchestrator.ts`
- Create: `server/_core/recoveryOrchestrator.test.ts`

**Interfaces:**
- Consumes: `RecoveryTransitionInput`, engine `evaluate()`, `DryRunRecoveryExecutor`, store.
- Produces:

```ts
export type RecoveryAuditEvent = {
  event:
    | "recovery_policy_evaluated"
    | "recovery_dry_run_started"
    | "recovery_dry_run_completed"
    | "recovery_suppressed"
    | "recovery_escalated"
    | "recovery_circuit_opened"
    | "recovery_circuit_closed";
  componentId: string;
  decisionId: string;
  reasonCode: RecoveryReasonCode;
  policyVersion: "d011b1-v1";
  attemptNumber: number;
  occurredAt: string;
};

export function createRecoveryOrchestrator(options: {
  engine: { evaluate(input: RecoveryTransitionInput, now?: Date): RecoveryDecision };
  executor: DryRunRecoveryExecutor;
  store: RecoveryPolicyStore;
  audit?: (event: RecoveryAuditEvent) => void;
}): {
  handle(input: RecoveryTransitionInput, now?: Date): Promise<RecoveryDecision>;
};
```

- [ ] **Step 1: Write failing orchestrator tests**

Cover:

1. `allow_dry_run` calls executor exactly once.
2. `suppress` does not call executor.
3. `escalate` does not call executor.
4. Two concurrent `handle()` calls for the same component cannot both enter executor; the second returns a suppression decision with `RECOVERY_ALREADY_IN_PROGRESS`.
5. Executor throw is swallowed by orchestrator after sanitized audit; raw error text such as `secret-token-123` never appears in emitted event.
6. Different components may execute concurrently.

- [ ] **Step 2: Run focused test and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryOrchestrator.test.ts
```

Expected: FAIL because orchestrator does not exist.

- [ ] **Step 3: Implement orchestration**

Flow:

```ts
const decision = engine.evaluate(input, now);
emit recovery_policy_evaluated;
if suppress -> emit recovery_suppressed; return decision;
if escalate -> emit recovery_escalated; return decision;
if store.get(component).inProgress -> return a fresh suppress decision via engine-compatible helper or pre-check;
set inProgress=true;
try {
  emit recovery_dry_run_started;
  await executor.execute(decision, now);
  emit recovery_dry_run_completed;
} catch {
  emit recovery_suppressed using the existing sanitized decision metadata only;
} finally {
  set inProgress=false preserving all other state fields;
}
return decision;
```

Do not place exception objects inside audit events.

- [ ] **Step 4: Run focused test and verify GREEN**

```bash
corepack pnpm vitest run server/_core/recoveryOrchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryOrchestrator.ts server/_core/recoveryOrchestrator.test.ts
git commit -m "feat(d011b1): add dry-run recovery orchestrator"
```

---

### Task 7: Runtime wiring through the existing watchdog transition callback

**Files:**
- Modify: `server/_core/operationalHealthRuntime.ts`
- Modify: `server/_core/operationalHealthRuntime.test.ts`

**Interfaces:**
- Existing `HealthTransition` stays unchanged: `{ componentId, from, to, occurredAt }`.
- Add optional runtime hook:

```ts
recoveryTransitionHandler?: (transition: HealthTransition) => void | Promise<void>;
```

The existing `onTransition` remains supported for compatibility.

- [ ] **Step 1: Add failing runtime tests**

Assert:

```ts
expect(recoveryTransitionHandler).toHaveBeenCalledWith({
  componentId: "database",
  from: "healthy",
  to: "unhealthy",
  occurredAt: "2026-09-07T12:00:00.000Z",
});
```

Also assert:

- handler receives the same sanitized object shape as logger;
- a rejected recovery handler promise does not prevent future watchdog cycles;
- installing runtime twice on the same Express app still creates one watchdog and one recovery wiring path;
- no second scheduler is introduced.

- [ ] **Step 2: Run focused runtime tests and verify RED**

```bash
corepack pnpm vitest run server/_core/operationalHealthRuntime.test.ts
```

Expected: new recovery hook assertions FAIL.

- [ ] **Step 3: Implement minimal hook**

Inside the existing watchdog `onTransition` callback:

```ts
const sanitized = sanitizeTransition(transition);
options.logTransition?.(sanitized);
await options.onTransition?.(sanitized);
await options.recoveryTransitionHandler?.(sanitized);
```

Wrap only `recoveryTransitionHandler` in a local `try/catch {}` so D-011B failure cannot escape into watchdog. Do not alter `/health` routes or create timers.

- [ ] **Step 4: Run focused runtime tests and D-011A regression tests**

```bash
corepack pnpm vitest run \
  server/_core/operationalHealthRuntime.test.ts \
  server/_core/healthWatchdog.test.ts \
  server/_core/healthRegistry.test.ts \
  server/_core/operationalHealthRegistry.test.ts \
  server/_core/operationalHealthHttpRegistry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/operationalHealthRuntime.ts server/_core/operationalHealthRuntime.test.ts
git commit -m "feat(d011b1): wire recovery dry-run to health runtime"
```

---

### Task 8: Bootstrap configuration in `server/_core/index.ts`

**Files:**
- Modify: `server/_core/index.ts`
- Add tests to: `server/_core/operationalHealthRuntime.test.ts` or create `server/_core/recoveryBootstrap.test.ts` if index import side effects make focused testing clearer.

**Interfaces:**
- Reuse the registry/runtime already created by the server bootstrap.
- Construct one store, engine, executor and orchestrator for the app process.

- [ ] **Step 1: Write failing bootstrap/configuration test**

The test must prove the default D-011B.1 configuration is:

```ts
{
  enabled: true,
  recoverableComponents: new Set(["database", "storage"]),
  cooldownMs: 30_000,
  attemptWindowMs: 15 * 60_000,
  maxAttempts: 3,
  healthyCyclesToCloseCircuit: 2,
}
```

The test must also prove the configured executor is the dry-run executor and that no restart adapter is constructible from bootstrap exports.

- [ ] **Step 2: Run focused test and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryBootstrap.test.ts
```

Expected: FAIL until configuration is extracted/implemented.

- [ ] **Step 3: Implement bootstrap wiring**

Prefer a focused exported factory in a new file if testing `index.ts` directly causes server side effects:

```ts
export function createD011b1RecoveryRuntime() {
  const store = createInMemoryRecoveryPolicyStore();
  const engine = createRecoveryPolicyEngine({ store, config: D011B1_POLICY });
  const executor = createDryRunRecoveryExecutor();
  const orchestrator = createRecoveryOrchestrator({ store, engine, executor, audit: sanitizedLogger });
  return { store, engine, executor, orchestrator };
}
```

Then `index.ts` passes a handler to `installOperationalHealthRuntime` that maps `HealthTransition` to `RecoveryTransitionInput`. Use deterministic transition id derived only from sanitized fields, for example:

```ts
const transitionId = `${transition.componentId}:${transition.from}:${transition.to}:${transition.occurredAt}`;
```

Criticality must come from a fixed component metadata map used only for recovery input; do not infer recovery authorization from `blocksReadiness`.

- [ ] **Step 4: Run bootstrap + policy + runtime tests**

```bash
corepack pnpm vitest run \
  server/_core/recoveryBootstrap.test.ts \
  server/_core/recoveryPolicy.test.ts \
  server/_core/recoveryDryRunExecutor.test.ts \
  server/_core/recoveryOrchestrator.test.ts \
  server/_core/operationalHealthRuntime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/index.ts server/_core/recoveryBootstrap.ts server/_core/recoveryBootstrap.test.ts
git commit -m "feat(d011b1): enable recovery policy dry-run bootstrap"
```

---

### Task 9: Structural safety boundary test

**Files:**
- Create: `server/d011b1SafetyBoundary.test.ts`

**Interfaces:** No runtime interface; this is a repository-level safety invariant.

- [ ] **Step 1: Write failing safety test before any prohibited capability can be added**

Test reads D-011B.1 production files and asserts forbidden imports/identifiers are absent:

```ts
const forbidden = [
  "node:child_process",
  "child_process",
  "dockerode",
  "kubernetes",
  "systemctl",
  "pm2",
  "ssh2",
  "runRestore",
  "runBackup",
  "../recovery",
  "./recovery/",
];
```

Scan only:

```ts
[
  "server/_core/recoveryPolicy.ts",
  "server/_core/recoveryPolicyStore.ts",
  "server/_core/recoveryDryRunExecutor.ts",
  "server/_core/recoveryOrchestrator.ts",
  "server/_core/recoveryBootstrap.ts",
]
```

Also assert `recoveryDryRunExecutor.ts` contains literal `mode: "dry_run"` and does not export any symbol containing `RestartAdapter`, `RealRecoveryExecutor` or `InfrastructureExecutor`.

- [ ] **Step 2: Run the safety test**

```bash
corepack pnpm vitest run server/d011b1SafetyBoundary.test.ts
```

Expected after Tasks 1-8: PASS. If it fails, treat as a blocking safety defect; do not weaken forbidden patterns to make it green.

- [ ] **Step 3: Commit**

```bash
git add server/d011b1SafetyBoundary.test.ts
git commit -m "test(d011b1): enforce dry-run safety boundary"
```

---

### Task 10: Full regression gate and Draft PR

**Files:**
- No production changes unless a test exposes a defect.
- PR body documents exact scope and explicitly states no restart/deploy/migration.

**Interfaces:** This task consumes the complete D-011B.1 implementation.

- [ ] **Step 1: Run security regression gate**

```bash
corepack pnpm security:check
```

Expected: exit 0 and approved invariants.

- [ ] **Step 2: Run TypeScript gate**

```bash
corepack pnpm check
```

Expected: exit 0.

- [ ] **Step 3: Run complete test suite**

```bash
corepack pnpm test
```

Expected: exit 0; no failing suites/tests. Record exact suite/test counts in the PR.

- [ ] **Step 4: Run production build**

```bash
corepack pnpm build
```

Expected: exit 0. Existing nonfatal analytics/chunk warnings may be recorded but must not be newly introduced by D-011B.1.

- [ ] **Step 5: Verify D-011A and administrative recovery remain separated**

Run:

```bash
corepack pnpm vitest run \
  server/_core/healthRegistry.test.ts \
  server/_core/healthWatchdog.test.ts \
  server/_core/operationalHealthRuntime.test.ts \
  server/recovery/backup.test.ts \
  server/recovery/restore.test.ts \
  server/recovery/recoveryDrill.test.ts \
  server/d011b1SafetyBoundary.test.ts
```

Expected: PASS.

- [ ] **Step 6: Open a Draft PR against `main`**

Title:

```text
D-011B.1 — Recovery Policy Engine + Dry-Run
```

Body must contain:

```text
Implementa a primeira camada de decisão do D-011B em modo exclusivamente dry-run.

Inclui RecoveryPolicyEngine, store in-memory, allowlist, cooldown, janela de tentativas, circuit breaker, idempotência, orchestrator e observabilidade sanitizada.

NÃO inclui restart real, kill, rollback, failover, restore, migration, deploy ou adapter de infraestrutura. `server/recovery` permanece desacoplado.

O PR permanece Draft até todos os gates e revisão final estarem GREEN.
```

- [ ] **Step 7: Verify CI checks the exact PR head SHA**

Confirm in Actions log that checkout `ref` equals the PR head SHA, not a synthetic merge ref. Do not promote PR to Ready if exact-head validation is absent.

- [ ] **Step 8: Request final code review**

Use `superpowers:requesting-code-review`. Critical/Important findings block promotion. Minor findings must be recorded and classified.

- [ ] **Step 9: Only after fresh full GREEN + review, mark PR Ready for review**

Do not merge automatically. Integration into `main` remains a separate human decision.

---

## Plan Self-Review Result

- Spec coverage: policy eligibility, allowlist, cooldown, 3-attempt limit, 4th-attempt escalation, recovery circuit, two healthy cycles, duplicate suppression, concurrency, dry-run executor, audit sanitization, runtime idempotency, D-011A regression and separation from `server/recovery` are each mapped to explicit tasks.
- Placeholder scan: no `TBD`, `TODO`, "implement later" or unspecified test steps remain.
- Type consistency: `RecoveryTransitionInput`, `RecoveryDecision`, `RecoveryPolicyStore`, `DryRunRecoveryExecutor` and `RecoveryAuditEvent` signatures are defined before consumption by later tasks.
- Scope control: D-011B.2 real restart adapter, rollback/fallback, external orchestrators and disaster recovery automation remain outside this plan.
