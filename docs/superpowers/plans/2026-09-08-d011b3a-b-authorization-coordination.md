# D-011B.3a/3b Authorization + Coordination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir autorização fail-closed, kill switch default-off, lease distribuído com fencing e reserva persistente de ação para preparar recovery ativo futuro sem executar qualquer side effect real.

**Architecture:** O fluxo existente `RecoveryPolicyEngine -> RecoveryOrchestrator -> RecoveryActionPort` permanece intacto como autoridade de decisão. D-011B.3a adiciona um `RecoveryActionAuthorizationGate` puro antes de qualquer futuro adapter ativo. D-011B.3b adiciona coordenação distribuída abstrata e persistência de idempotência com fencing token, mas continua usando somente adapter simulado no runtime. O side-effect real permanece proibido e reservado ao D-011B.3c, que exige novo gate humano explícito antes de qualquer implementação.

**Tech Stack:** TypeScript 5.9, Vitest 2.1, Node.js 24, pnpm 10, arquitetura existente em `server/_core`.

**Spec:** `docs/superpowers/specs/2026-09-08-d011b3-controlled-recovery-adapter-design.md`

## Global Constraints

- D-011B.3a e D-011B.3b NÃO executam restart real.
- `RecoveryActionPort` continua ligado ao `SimulatedRecoveryAdapter` no runtime deste plano.
- Active recovery permanece desabilitado por padrão.
- Configuração ausente, parcial, inválida ou ambígua deve negar active recovery.
- Produção deve ser explicitamente negada neste ciclo.
- Apenas um ambiente lógico e um componente lógico podem ser autorizados na configuração ativa deste plano.
- Somente `restart_component` pode ser autorizado semanticamente.
- Nenhum comando, unit name, container id, pod id, host, endpoint, token, segredo ou target operacional entra em payload não confiável.
- Não importar `child_process`, `exec`, `spawn`, `fork`, `execFile`, `systemctl`, Docker, Podman, Kubernetes, SSH, hypervisor, cloud SDK ou `server/recovery` para execução automática.
- Não criar endpoint HTTP, UI, CLI ou mutation para habilitar kill switch ou disparar active recovery.
- Lease distribuído deve falhar fechado e não pode ter fallback local in-memory no caminho ativo.
- Lease deve carregar `fencingToken` monotônico ou garantia equivalente; TTL sozinho não é suficiente.
- Reserva persistente deve acontecer antes de qualquer futuro side-effect.
- `unknown_outcome` nunca pode gerar retry automático.
- Duplicata terminal idêntica reutiliza resultado persistido; duplicata conflitante falha fechada; duplicata não-terminal não inicia segunda execução.
- Nenhum arquivo deste plano pode introduzir o adapter real do D-011B.3c.
- Todos os passos seguem RED -> GREEN -> revisão -> commit.

---

## File Structure Locked for This Plan

### D-011B.3a
- `server/_core/activeRecoveryAuthorization.ts` — configuração ativa, reason codes, decisão fail-closed e pure authorization gate.
- `server/_core/activeRecoveryAuthorization.test.ts` — default-off, ambiente, componente, ação, config inválida e produção negada.
- `server/_core/activeRecoveryBootstrap.ts` — composição segura que lê configuração trusted-only e continua retornando adapter simulado.
- `server/_core/activeRecoveryBootstrap.test.ts` — prova runtime default-off e ausência de knobs remotos.

### D-011B.3b
- `server/_core/recoveryLease.ts` — contrato de lease com owner, TTL e `fencingToken`.
- `server/_core/recoveryLease.test.ts` — semântica do contrato e fail-closed.
- `server/_core/recoveryActionRecord.ts` — contrato de reserva persistente/idempotência e estados normalizados.
- `server/_core/recoveryActionRecord.test.ts` — duplicata terminal, conflito, non-terminal e unknown outcome.
- `server/_core/recoveryActiveCoordinator.ts` — ordem authorization -> lease/fencing -> reservation -> revalidation, sem side effect real.
- `server/_core/recoveryActiveCoordinator.test.ts` — exclusão cross-instance, backend failure, fencing e no-double-execution.
- `server/d011b3abSafetyBoundary.test.ts` — barreira estrutural provando ausência de execução real e ausência de bypass.

No arquivo existente deve ser conectado a um adapter real neste plano.

---

### Task 1: Active recovery configuration + pure authorization gate

**Files:**
- Create: `server/_core/activeRecoveryAuthorization.ts`
- Create: `server/_core/activeRecoveryAuthorization.test.ts`

**Interfaces:**

```ts
import type { RecoveryActionRequest } from "./recoveryAction";

export type ActiveRecoveryEnvironment =
  | "development-controlled"
  | "homologation-controlled"
  | "production";

export type ActiveRecoveryAuthorizationReason =
  | "AUTHORIZED"
  | "ACTIVE_RECOVERY_DISABLED"
  | "ENVIRONMENT_NOT_AUTHORIZED"
  | "COMPONENT_NOT_AUTHORIZED"
  | "ACTION_NOT_AUTHORIZED"
  | "AUTHORIZATION_CONFIG_INVALID";

export type ActiveRecoveryConfig = Readonly<{
  enabled: boolean;
  environment: ActiveRecoveryEnvironment;
  authorizedEnvironment: "homologation-controlled";
  authorizedComponent: "database";
  authorizedAction: "restart_component";
  leaseNamespace: "d011b3-v1";
}>;

export type ActiveRecoveryAuthorizationDecision = Readonly<{
  authorized: boolean;
  reasonCode: ActiveRecoveryAuthorizationReason;
  componentId: string;
  actionId: string;
  environment: ActiveRecoveryEnvironment;
  leaseNamespace: "d011b3-v1";
}>;

export function authorizeRecoveryAction(input: {
  request: RecoveryActionRequest;
  config?: ActiveRecoveryConfig | null;
}): ActiveRecoveryAuthorizationDecision;
```

- [ ] **Step 1: Write failing authorization tests**

```ts
import { describe, expect, it } from "vitest";
import { authorizeRecoveryAction } from "./activeRecoveryAuthorization";

const request = {
  actionId: "action:decision-1",
  transitionId: "transition-1",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-08T00:00:00.000Z",
  correlationId: "decision-1",
};

const enabledConfig = {
  enabled: true,
  environment: "homologation-controlled" as const,
  authorizedEnvironment: "homologation-controlled" as const,
  authorizedComponent: "database" as const,
  authorizedAction: "restart_component" as const,
  leaseNamespace: "d011b3-v1" as const,
};

describe("authorizeRecoveryAction", () => {
  it("denies when config is absent", () => {
    expect(authorizeRecoveryAction({ request, config: null }).reasonCode)
      .toBe("AUTHORIZATION_CONFIG_INVALID");
  });

  it("denies when active recovery is disabled", () => {
    expect(authorizeRecoveryAction({
      request,
      config: { ...enabledConfig, enabled: false },
    }).reasonCode).toBe("ACTIVE_RECOVERY_DISABLED");
  });

  it("denies production", () => {
    expect(authorizeRecoveryAction({
      request,
      config: { ...enabledConfig, environment: "production" },
    }).reasonCode).toBe("ENVIRONMENT_NOT_AUTHORIZED");
  });

  it("denies a different component", () => {
    expect(authorizeRecoveryAction({
      request: { ...request, componentId: "storage" },
      config: enabledConfig,
    }).reasonCode).toBe("COMPONENT_NOT_AUTHORIZED");
  });

  it("authorizes only the exact homologation/database/restart tuple", () => {
    expect(authorizeRecoveryAction({ request, config: enabledConfig })).toMatchObject({
      authorized: true,
      reasonCode: "AUTHORIZED",
      componentId: "database",
      environment: "homologation-controlled",
    });
  });
});
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
corepack pnpm vitest run server/_core/activeRecoveryAuthorization.test.ts
```

Expected: FAIL because `./activeRecoveryAuthorization` does not exist.

- [ ] **Step 3: Implement minimal pure gate**

Implement only deterministic validation. Do not read `process.env`, files, HTTP state, DB, network or infrastructure from this module. Missing/invalid config must return `authorized:false` with stable reason codes; never throw raw input details.

- [ ] **Step 4: Run focused test and verify GREEN**

```bash
corepack pnpm vitest run server/_core/activeRecoveryAuthorization.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_core/activeRecoveryAuthorization.ts server/_core/activeRecoveryAuthorization.test.ts
git commit -m "feat(d011b3a): add fail-closed active recovery authorization"
```

---

### Task 2: Safe active-recovery composition root, still simulation-only

**Files:**
- Create: `server/_core/activeRecoveryBootstrap.ts`
- Create: `server/_core/activeRecoveryBootstrap.test.ts`
- Read only: `server/_core/recoveryBootstrap.ts`

**Interfaces:**

```ts
import type { ActiveRecoveryConfig } from "./activeRecoveryAuthorization";
import type { RecoveryActionPort } from "./recoveryAction";

export type ActiveRecoveryBootstrap = Readonly<{
  config: ActiveRecoveryConfig;
  actionPort: RecoveryActionPort;
}>;

export function createActiveRecoveryBootstrap(options?: {
  config?: ActiveRecoveryConfig | null;
}): ActiveRecoveryBootstrap;
```

Default config must be exactly disabled and homologation-scoped:

```ts
{
  enabled: false,
  environment: "homologation-controlled",
  authorizedEnvironment: "homologation-controlled",
  authorizedComponent: "database",
  authorizedAction: "restart_component",
  leaseNamespace: "d011b3-v1",
}
```

- [ ] **Step 1: Write RED bootstrap tests**

Tests must prove:
- default `enabled === false`;
- returned `actionPort` is still the existing simulated adapter behavior;
- passing `environment:"production"` never authorizes active recovery via the pure gate;
- file source contains no HTTP/CLI/UI hook and no import of execution primitives;
- no `ACTIVE_RECOVERY_ENABLED` env knob is introduced in this task.

- [ ] **Step 2: Run and verify RED**

```bash
corepack pnpm vitest run server/_core/activeRecoveryBootstrap.test.ts
```

Expected: FAIL because bootstrap does not exist.

- [ ] **Step 3: Implement safe bootstrap**

Use `createSimulatedRecoveryAdapter({ scenario: "success", ... })` only. Do not alter `server/_core/index.ts` to enable active recovery. Do not expose config through router/API.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
corepack pnpm vitest run \
  server/_core/activeRecoveryAuthorization.test.ts \
  server/_core/activeRecoveryBootstrap.test.ts \
  server/_core/simulatedRecoveryAdapter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/_core/activeRecoveryBootstrap.ts server/_core/activeRecoveryBootstrap.test.ts
git commit -m "feat(d011b3a): add disabled active recovery bootstrap"
```

---

### Task 3: Recovery lease contract with fencing token

**Files:**
- Create: `server/_core/recoveryLease.ts`
- Create: `server/_core/recoveryLease.test.ts`

**Interfaces:**

```ts
export type RecoveryLease = Readonly<{
  leaseId: string;
  namespace: "d011b3-v1";
  componentId: string;
  actionId: string;
  ownerId: string;
  fencingToken: number;
  acquiredAt: string;
  expiresAt: string;
}>;

export type RecoveryLeaseAcquireResult =
  | Readonly<{ acquired: true; lease: RecoveryLease }>
  | Readonly<{ acquired: false; reasonCode: "LEASE_HELD" | "LEASE_BACKEND_UNAVAILABLE" | "LEASE_INVALID" }>;

export type RecoveryLeasePort = {
  acquire(input: {
    namespace: "d011b3-v1";
    componentId: string;
    actionId: string;
    ownerId: string;
    ttlMs: number;
  }): Promise<RecoveryLeaseAcquireResult>;
  validateFence(lease: RecoveryLease): Promise<boolean>;
  release(lease: RecoveryLease): Promise<void>;
};
```

- [ ] **Step 1: Write contract tests**

Tests must assert:
- `fencingToken` exists and is positive integer;
- acquire failure has closed reason codes;
- `validateFence` is part of the interface before any future side effect;
- no in-memory fallback implementation is exported from this production module.

- [ ] **Step 2: Run and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryLease.test.ts
```

Expected: FAIL because module is absent.

- [ ] **Step 3: Implement types/validators only**

This task must not choose Redis/Postgres/MySQL or implement a fake production backend. Provide small validator helpers if needed, e.g. `isValidRecoveryLease(lease): boolean`.

- [ ] **Step 4: Run and verify GREEN**

```bash
corepack pnpm vitest run server/_core/recoveryLease.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryLease.ts server/_core/recoveryLease.test.ts
git commit -m "feat(d011b3b): define fenced recovery lease contract"
```

---

### Task 4: Persistent action record contract

**Files:**
- Create: `server/_core/recoveryActionRecord.ts`
- Create: `server/_core/recoveryActionRecord.test.ts`

**Interfaces:**

```ts
export type RecoveryActionRecordState =
  | "reserved"
  | "executing"
  | "completed_success"
  | "completed_failure"
  | "verification_failed"
  | "unknown_outcome";

export type RecoveryActionRecord = Readonly<{
  actionId: string;
  componentId: string;
  correlationId: string;
  action: "restart_component";
  state: RecoveryActionRecordState;
  fencingToken: number;
  createdAt: string;
  updatedAt: string;
}>;

export type RecoveryActionReserveResult =
  | Readonly<{ status: "reserved"; record: RecoveryActionRecord }>
  | Readonly<{ status: "existing_terminal"; record: RecoveryActionRecord }>
  | Readonly<{ status: "existing_non_terminal"; record: RecoveryActionRecord }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "store_unavailable" }>;

export type RecoveryActionRecordPort = {
  reserve(input: Omit<RecoveryActionRecord, "state" | "createdAt" | "updatedAt">): Promise<RecoveryActionReserveResult>;
  updateState(input: {
    actionId: string;
    expectedFencingToken: number;
    state: RecoveryActionRecordState;
    at: string;
  }): Promise<boolean>;
  get(actionId: string): Promise<RecoveryActionRecord | null>;
};
```

- [ ] **Step 1: Write RED tests for identity semantics**

Tests must cover:
- terminal exact duplicate reuses stored record;
- conflicting same `actionId` returns `conflict`;
- non-terminal duplicate returns `existing_non_terminal`;
- store unavailable is distinct and fail-closed;
- `unknown_outcome` is a terminal state for no-auto-retry semantics in this plan.

- [ ] **Step 2: Run and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryActionRecord.test.ts
```

- [ ] **Step 3: Implement contracts + pure comparison helper**

Add a helper such as:

```ts
export function sameRecoveryActionIdentity(
  record: RecoveryActionRecord,
  input: Pick<RecoveryActionRecord, "actionId" | "componentId" | "correlationId" | "action">,
): boolean;
```

No database adapter is implemented in this task.

- [ ] **Step 4: Run and verify GREEN**

```bash
corepack pnpm vitest run server/_core/recoveryActionRecord.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryActionRecord.ts server/_core/recoveryActionRecord.test.ts
git commit -m "feat(d011b3b): define persistent recovery action record"
```

---

### Task 5: Active coordinator — authorization, lease, reservation, revalidation

**Files:**
- Create: `server/_core/recoveryActiveCoordinator.ts`
- Create: `server/_core/recoveryActiveCoordinator.test.ts`

**Interfaces:**

```ts
import type { RecoveryActionRequest } from "./recoveryAction";
import type { ActiveRecoveryConfig } from "./activeRecoveryAuthorization";
import type { RecoveryLeasePort } from "./recoveryLease";
import type { RecoveryActionRecordPort } from "./recoveryActionRecord";

export type RecoveryActiveCoordinationResult = Readonly<{
  allowedToReachFutureAdapter: boolean;
  reasonCode:
    | "AUTHORIZED_AND_RESERVED"
    | "AUTHORIZATION_DENIED"
    | "LEASE_DENIED"
    | "LEASE_BACKEND_UNAVAILABLE"
    | "ACTION_DUPLICATE_TERMINAL"
    | "ACTION_ALREADY_IN_PROGRESS"
    | "ACTION_CONFLICT"
    | "ACTION_STORE_UNAVAILABLE"
    | "FENCE_INVALID";
  fencingToken?: number;
}>;

export function createRecoveryActiveCoordinator(options: {
  config: ActiveRecoveryConfig;
  leasePort: RecoveryLeasePort;
  recordPort: RecoveryActionRecordPort;
  ownerId: string;
  leaseTtlMs: number;
  now?: () => Date;
}): {
  prepare(request: RecoveryActionRequest): Promise<RecoveryActiveCoordinationResult>;
};
```

Exact prepare order:
1. `authorizeRecoveryAction`;
2. acquire fenced lease;
3. reserve action record with acquired fencing token;
4. call `validateFence(lease)`;
5. only then return `allowedToReachFutureAdapter:true`.

No adapter is invoked in this task.

- [ ] **Step 1: Write RED coordinator tests**

Tests must prove:
- disabled config stops before lease call;
- lease unavailable stops before record reservation;
- lease held stops before record reservation;
- store unavailable releases owned lease and returns fail-closed result;
- conflict releases lease and denies;
- existing non-terminal denies second execution;
- exact terminal duplicate does not become eligible to execute again;
- stale/invalid fence after reservation denies future adapter reach;
- successful path calls authorization -> acquire -> reserve -> validateFence in that order;
- returned result contains only sanitized identifiers/reason codes.

- [ ] **Step 2: Run and verify RED**

```bash
corepack pnpm vitest run server/_core/recoveryActiveCoordinator.test.ts
```

Expected: FAIL because coordinator module is absent.

- [ ] **Step 3: Implement minimal coordinator**

Do not accept an `actionPort` parameter. This is deliberate: D-011B.3b may prepare an action but may not execute it.

- [ ] **Step 4: Run and verify GREEN**

```bash
corepack pnpm vitest run \
  server/_core/activeRecoveryAuthorization.test.ts \
  server/_core/recoveryLease.test.ts \
  server/_core/recoveryActionRecord.test.ts \
  server/_core/recoveryActiveCoordinator.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/_core/recoveryActiveCoordinator.ts server/_core/recoveryActiveCoordinator.test.ts
git commit -m "feat(d011b3b): add fenced recovery coordination gate"
```

---

### Task 6: Cross-instance exclusion test harness, test-only

**Files:**
- Modify: `server/_core/recoveryActiveCoordinator.test.ts`
- Do not create production in-memory coordination adapters.

- [ ] **Step 1: Add a test-local shared fake backend**

Inside the test file only, create a deterministic shared fake that simulates:
- atomic lease ownership;
- monotonic fencing tokens;
- shared action records across two coordinator instances.

- [ ] **Step 2: Add concurrency RED test**

Create two coordinators with distinct `ownerId`s and the same shared fake backend. Run `Promise.all` against the same `RecoveryActionRequest`. Assert exactly one result is `AUTHORIZED_AND_RESERVED` and the other is denied (`LEASE_DENIED`, `ACTION_ALREADY_IN_PROGRESS`, or equivalent deterministic result chosen by the fake ordering), never two allowed results.

- [ ] **Step 3: Run and confirm RED if coordinator is not concurrency-safe**

```bash
corepack pnpm vitest run server/_core/recoveryActiveCoordinator.test.ts
```

- [ ] **Step 4: Apply only the minimal coordinator fix if needed**

Do not add retries. Do not add local fallback. Preserve acquire-before-reserve ordering and fencing validation.

- [ ] **Step 5: Verify GREEN and commit**

```bash
corepack pnpm vitest run server/_core/recoveryActiveCoordinator.test.ts

git add server/_core/recoveryActiveCoordinator.ts server/_core/recoveryActiveCoordinator.test.ts
git commit -m "test(d011b3b): prove cross-instance recovery exclusion"
```

---

### Task 7: Structural safety boundary for 3a/3b

**Files:**
- Create: `server/d011b3abSafetyBoundary.test.ts`

- [ ] **Step 1: Write structural assertions**

Production files scanned:
- `server/_core/activeRecoveryAuthorization.ts`
- `server/_core/activeRecoveryBootstrap.ts`
- `server/_core/recoveryLease.ts`
- `server/_core/recoveryActionRecord.ts`
- `server/_core/recoveryActiveCoordinator.ts`

Forbidden tokens/imports must include:
- `node:child_process`
- `child_process`
- `exec(`
- `execFile(`
- `spawn(`
- `fork(`
- `systemctl`
- `dockerode`
- `kubernetes`
- `@kubernetes`
- `ssh2`
- `runRestore`
- `runBackup`
- `../recovery`
- `./recovery/`

Also assert:
- coordinator source contains no `actionPort.execute` and no `RecoveryActionPort` dependency;
- bootstrap remains simulation-only;
- default active config contains `enabled: false`;
- production cannot equal authorized environment;
- no HTTP/router/UI file imports `createRecoveryActiveCoordinator` or kill-switch mutator;
- no production module exports a local in-memory `RecoveryLeasePort` implementation for active use.

- [ ] **Step 2: Run boundary test**

```bash
corepack pnpm vitest run server/d011b3abSafetyBoundary.test.ts
```

Expected: PASS without production changes. If it fails, fix the violating production design, not the test, unless the assertion incorrectly references an intentionally renamed file.

- [ ] **Step 3: Commit**

```bash
git add server/d011b3abSafetyBoundary.test.ts
git commit -m "test(d011b3): enforce authorization and coordination safety boundary"
```

---

### Task 8: Full regression and final review for 3a/3b

**Files:**
- No production change expected.

- [ ] **Step 1: Run focused recovery suite**

```bash
corepack pnpm vitest run \
  server/_core/recoveryPolicy.test.ts \
  server/_core/recoveryHealthyConfirmation.test.ts \
  server/_core/recoveryAction.test.ts \
  server/_core/simulatedRecoveryAdapter.test.ts \
  server/_core/recoveryOrchestrator.test.ts \
  server/_core/recoveryBootstrap.test.ts \
  server/_core/activeRecoveryAuthorization.test.ts \
  server/_core/activeRecoveryBootstrap.test.ts \
  server/_core/recoveryLease.test.ts \
  server/_core/recoveryActionRecord.test.ts \
  server/_core/recoveryActiveCoordinator.test.ts \
  server/d011b1SafetyBoundary.test.ts \
  server/d011b2SafetyBoundary.test.ts \
  server/d011b3abSafetyBoundary.test.ts
```

- [ ] **Step 2: Run project gates**

```bash
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

Expected: all GREEN on the exact branch head.

- [ ] **Step 3: Review against spec**

Reject the delivery if any of these are true:
- active code can execute infrastructure;
- production is authorizable;
- kill switch defaults on;
- missing config enables recovery;
- a request payload can pick environment/component/target;
- lease has no fencing token semantics;
- coordinator can continue when lease/store is unavailable;
- duplicate can become eligible twice across shared coordination state;
- `unknown_outcome` can trigger retry;
- `server/recovery` is reachable automatically;
- a runtime endpoint can toggle or bypass authorization.

- [ ] **Step 4: PR state**

Keep PR Draft until exact-head CI is GREEN and final review has no Critical/Important findings. Only then mark Ready for Review. Do not merge without explicit human approval.

---

## Explicit Stop Gate Before D-011B.3c

Completion of this plan does **not** authorize implementation of a real recovery adapter.

Before any D-011B.3c plan or code is created, require a new explicit human approval that selects:
1. the isolated environment to use;
2. the single logical component;
3. the fixed operational target;
4. the exact infrastructure mechanism/API;
5. the real atomic coordination backend;
6. the persistent action-record backend;
7. the controlled drill procedure.

Without that approval, D-011B.3c remains at 0% and no side-effect library/import may be introduced.
