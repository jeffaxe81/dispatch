# D-011C Failover e Contingência Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar um subsistema de failover determinístico, auditável, fail-closed e 100% `simulation-only`, separado da D-011B, cobrindo topologia/elegibilidade, planner anti-split-brain, adapter simulado e evidência verificável.

**Architecture:** A D-011C cria contratos próprios sob `server/_core/` e não amplia `RecoveryActionKind`, não altera `recoveryExecutionBoundary.ts` e não reutiliza o namespace de lease `d011b3-v1`. O fluxo é `Health Evidence -> Topology Validation -> Eligibility -> Candidate Selection -> FailoverPlan -> Simulated Adapter -> Evidence Receipt -> Verification`, com PR independente por microentrega C.1–C.4.

**Tech Stack:** TypeScript 5.9, Vitest 2.1, Node.js 24, `node:crypto` para SHA-256 canônico, pnpm/Corepack, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-10-d011c-failover-contingency-design.md`

## Global Constraints

- D-011C é **100% simulation-only**.
- Nunca promover/rebaixar nó, alterar primary/standby, DNS, VIP, balanceador, rota, proxy ou endpoint.
- Nunca reiniciar serviço/processo/container/VM e nunca invocar systemd, Docker, Podman, Kubernetes, SSH, hypervisor ou API de cloud.
- Nunca iniciar restore, rollback, migration, replicação, retry automático ou failover automático.
- Não alterar `server/_core/recoveryAction.ts`.
- Não alterar `server/_core/recoveryExecutionBoundary.ts`.
- Não adicionar ação real ao executor D-011B.
- Não reutilizar o namespace `d011b3-v1` como coordenação de failover.
- Não disparar D-011C automaticamente a partir de `escalate` da D-011B.
- Todas as decisões devem ser determinísticas, sanitizadas e fail-closed.
- Cada microentrega segue RED -> GREEN -> hardening, Draft PR e merge somente após aprovação explícita.
- Gates de cada head candidato: suíte específica, suíte completa, `corepack pnpm check`, `corepack pnpm security:check`, `corepack pnpm build` e workflows GitHub aplicáveis.
- Nenhuma migration de banco, schema change ou habilitação produtiva faz parte deste plano.

---

## File Map

- `server/_core/failoverTopology.ts` — tipos D-011C.1 e validação estrutural pura de topologia, health evidence e coordination context.
- `server/_core/failoverTopology.test.ts` — TDD de contratos estruturais, timestamps, geração, tenant/component, fencing e single-active.
- `server/_core/failoverEligibility.ts` — avaliação fail-closed da origem e candidatos seguros; não cria plano.
- `server/_core/failoverEligibility.test.ts` — TDD de origem degraded/unhealthy, target healthy e reason codes determinísticos.
- `server/_core/failoverPlanner.ts` — seleção lexical determinística e criação imutável do `FailoverPlan` D-011C.2.
- `server/_core/failoverPlanner.test.ts` — TDD de source/target binding, TTL e anti-split-brain.
- `server/_core/failoverSimulation.ts` — tipos/capability/validação de pedido e resultado simulado D-011C.3.
- `server/_core/simulatedFailoverAdapter.ts` — adapter in-memory sem portas externas.
- `server/_core/simulatedFailoverAdapter.test.ts` — TDD de sucesso/rejeição/falha simulados e identidade.
- `server/d011c3SafetyBoundary.test.ts` — boundary estático garantindo ausência de imports/integrações proibidas.
- `server/_core/failoverSimulationEvidence.ts` — receipt SHA-256 canônico e verifier puro D-011C.4.
- `server/_core/failoverSimulationEvidence.test.ts` — TDD de digest, tenant context, links, semântica e timeline.
- `docs/releases/d011c-failover-verification.md` — fechamento técnico após C.1–C.4 integrarem.
- `CHANGELOG.md` — registro final D-011C, somente depois do fechamento funcional.

---

### Task 1: D-011C.1 — Failover Topology & Eligibility Contract

**Files:**
- Create: `server/_core/failoverTopology.ts`
- Create: `server/_core/failoverTopology.test.ts`
- Create: `server/_core/failoverEligibility.ts`
- Create: `server/_core/failoverEligibility.test.ts`

**Interfaces:**
- Produces:
  - `FailoverNode`
  - `FailoverTopology`
  - `FailoverHealthEvidence`
  - `FailoverCoordinationContext`
  - `validateFailoverTopologyInput(input, now): FailoverTopologyValidationResult`
  - `evaluateFailoverEligibility(input, now): FailoverEligibilityResult`
- Consumed later by Task 2; Task 1 must not create `FailoverPlan`.

#### Contract to implement

```ts
export type FailoverNode = Readonly<{
  nodeId: string;
  componentId: string;
  role: "active" | "standby";
  generation: number;
  enabled: boolean;
}>;

export type FailoverTopology = Readonly<{
  topologyId: string;
  topologyVersion: "d011c1-v1";
  tenantId: string;
  componentId: string;
  generation: number;
  observedAt: string;
  nodes: readonly FailoverNode[];
}>;

export type FailoverHealthEvidence = Readonly<{
  evidenceId: string;
  tenantId: string;
  nodeId: string;
  componentId: string;
  state: "healthy" | "degraded" | "unhealthy" | "unknown";
  checkedAt: string;
  validUntil: string;
}>;

export type FailoverCoordinationContext = Readonly<{
  tenantId: string;
  componentId: string;
  ownerId: string;
  fencingToken: number;
  topologyGeneration: number;
  issuedAt: string;
  expiresAt: string;
}>;
```

Use o resultado de validação:

```ts
export type FailoverTopologyReasonCode =
  | "TOPOLOGY_VALID"
  | "TOPOLOGY_INVALID"
  | "MULTIPLE_ACTIVE_NODES"
  | "ACTIVE_NODE_MISSING"
  | "HEALTH_EVIDENCE_MISSING"
  | "HEALTH_EVIDENCE_STALE"
  | "TENANT_MISMATCH"
  | "COMPONENT_MISMATCH"
  | "TOPOLOGY_GENERATION_MISMATCH"
  | "FENCING_INVALID"
  | "COORDINATION_EXPIRED";

export type FailoverTopologyValidationResult =
  | Readonly<{
      valid: true;
      reasonCode: "TOPOLOGY_VALID";
      sourceNodeId: string;
    }>
  | Readonly<{
      valid: false;
      reasonCode: Exclude<FailoverTopologyReasonCode, "TOPOLOGY_VALID">;
    }>;
```

Use o resultado de elegibilidade:

```ts
export type FailoverEligibilityReasonCode =
  | "FAILOVER_ELIGIBLE"
  | "TOPOLOGY_INVALID"
  | "MULTIPLE_ACTIVE_NODES"
  | "ACTIVE_NODE_MISSING"
  | "SOURCE_NOT_FAILOVER_ELIGIBLE"
  | "NO_SAFE_CANDIDATE"
  | "HEALTH_EVIDENCE_MISSING"
  | "HEALTH_EVIDENCE_STALE"
  | "TENANT_MISMATCH"
  | "COMPONENT_MISMATCH"
  | "TOPOLOGY_GENERATION_MISMATCH"
  | "FENCING_INVALID"
  | "COORDINATION_EXPIRED";

export type SafeFailoverCandidate = Readonly<{
  nodeId: string;
  evidenceId: string;
}>;

export type FailoverEligibilityResult =
  | Readonly<{
      eligible: true;
      reasonCode: "FAILOVER_ELIGIBLE";
      sourceNodeId: string;
      sourceEvidenceId: string;
      candidates: readonly SafeFailoverCandidate[];
    }>
  | Readonly<{
      eligible: false;
      reasonCode: Exclude<FailoverEligibilityReasonCode, "FAILOVER_ELIGIBLE">;
    }>;
```

A prioridade de rejeição deve ser determinística nesta ordem: shape/timestamps básicos -> tenant -> component -> generation -> fencing/coordination window -> single-active -> source evidence -> source state -> candidate evidence -> candidate health/no safe candidate.

- [ ] **Step 1: Create checkpoint and feature branch from latest `main`**

```bash
git checkout main
git pull --ff-only
BASE_SHA=$(git rev-parse HEAD)
git branch checkpoint/pre-d011c1-failover-topology-20260910 "$BASE_SHA"
git checkout -b feat/d011c1-failover-topology-eligibility-20260910 "$BASE_SHA"
```

- [ ] **Step 2: Write RED tests for structural validation**

Create `server/_core/failoverTopology.test.ts` with fixtures using one active `node-a`, one standby `node-b`, generation `7`, tenant `tenant-a`, component `database`, and fixed `now = 2026-09-10T20:00:00.000Z`.

Minimum RED assertions:

```ts
expect(validateFailoverTopologyInput(validInput, now)).toEqual({
  valid: true,
  reasonCode: "TOPOLOGY_VALID",
  sourceNodeId: "node-a",
});

expect(validateFailoverTopologyInput(inputWithTwoActiveNodes, now)).toEqual({
  valid: false,
  reasonCode: "MULTIPLE_ACTIVE_NODES",
});

expect(validateFailoverTopologyInput(inputWithNoActiveNode, now)).toEqual({
  valid: false,
  reasonCode: "ACTIVE_NODE_MISSING",
});
```

Also assert: duplicated node IDs -> `TOPOLOGY_INVALID`; blank IDs -> `TOPOLOGY_INVALID`; node generation mismatch -> `TOPOLOGY_GENERATION_MISMATCH`; tenant mismatch -> `TENANT_MISMATCH`; component mismatch -> `COMPONENT_MISMATCH`; zero/negative/non-integer fencing -> `FENCING_INVALID`; expired coordination -> `COORDINATION_EXPIRED`; invalid health timeline (`validUntil <= checkedAt`) -> `TOPOLOGY_INVALID`; expired health evidence -> `HEALTH_EVIDENCE_STALE`.

- [ ] **Step 3: Run RED structural suite**

```bash
corepack pnpm vitest run server/_core/failoverTopology.test.ts
```

Expected: FAIL because `./failoverTopology` does not exist.

- [ ] **Step 4: Implement minimal structural contracts/validator**

Create `server/_core/failoverTopology.ts`. Keep it pure: no DB, network, filesystem, timers, environment reads or imports from D-011B execution files. Use helpers `isNonEmptyString`, `isPositiveInteger`, `parseFiniteTimestamp`. Freeze no external state; only inspect input.

Validation must require:

```ts
const enabledActiveNodes = topology.nodes.filter(
  node => node.enabled && node.role === "active",
);
```

Return `ACTIVE_NODE_MISSING` when length is `0`, `MULTIPLE_ACTIVE_NODES` when `> 1`, otherwise bind `sourceNodeId` to the single active node.

- [ ] **Step 5: Run structural suite GREEN**

```bash
corepack pnpm vitest run server/_core/failoverTopology.test.ts
```

Expected: all Task 1 structural tests PASS.

- [ ] **Step 6: Write RED eligibility tests**

Create `server/_core/failoverEligibility.test.ts` and assert at minimum:

```ts
const result = evaluateFailoverEligibility(validInput, now);
expect(result).toEqual({
  eligible: true,
  reasonCode: "FAILOVER_ELIGIBLE",
  sourceNodeId: "node-a",
  sourceEvidenceId: "health-a",
  candidates: [{ nodeId: "node-b", evidenceId: "health-b" }],
});
```

Add explicit RED cases: source `healthy` -> `SOURCE_NOT_FAILOVER_ELIGIBLE`; source `unknown` -> `SOURCE_NOT_FAILOVER_ELIGIBLE`; target `degraded|unhealthy|unknown` excluded; no remaining healthy standby -> `NO_SAFE_CANDIDATE`; missing source evidence -> `HEALTH_EVIDENCE_MISSING`; stale target evidence -> `HEALTH_EVIDENCE_STALE`; mismatched tenant/component/generation/fencing propagate the structural reason.

- [ ] **Step 7: Run RED eligibility suite**

```bash
corepack pnpm vitest run server/_core/failoverEligibility.test.ts
```

Expected: FAIL because `./failoverEligibility` does not exist.

- [ ] **Step 8: Implement minimal eligibility evaluator**

Create `server/_core/failoverEligibility.ts`. First call `validateFailoverTopologyInput`. Then bind source evidence by exact `tenantId + componentId + nodeId`; source state must be `degraded` or `unhealthy`. Safe targets are enabled standbys, different from source, with exact matching non-stale evidence in state `healthy`.

Return candidates sorted lexically by `nodeId`:

```ts
const candidates = safeCandidates
  .map(({ node, evidence }) => ({ nodeId: node.nodeId, evidenceId: evidence.evidenceId }))
  .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
```

- [ ] **Step 9: Run both C.1 suites GREEN**

```bash
corepack pnpm vitest run \
  server/_core/failoverTopology.test.ts \
  server/_core/failoverEligibility.test.ts
```

Expected: PASS.

- [ ] **Step 10: Run full gates**

```bash
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

Expected: all GREEN; existing unrelated build warnings may remain but no new failure.

- [ ] **Step 11: Commit C.1 in reviewable TDD increments**

```bash
git add server/_core/failoverTopology.test.ts
git commit -m "test: define D-011C.1 failover topology contract"

git add server/_core/failoverTopology.ts
git commit -m "feat: add D-011C.1 failover topology validation"

git add server/_core/failoverEligibility.test.ts
git commit -m "test: define D-011C.1 failover eligibility contract"

git add server/_core/failoverEligibility.ts
git commit -m "feat: add D-011C.1 failover eligibility"
```

- [ ] **Step 12: Open Draft PR and stop at human merge gate**

PR title: `D-011C.1 — Failover Topology & Eligibility Contract`.

Body must state `simulation-only`, exact base/head SHAs, RED/GREEN evidence, full gate results, changed-file scope, and `Do not merge without explicit approval`. Do not start C.2 until C.1 is merged into `main` after explicit approval.

---

### Task 2: D-011C.2 — Failover Planner & Anti-Split-Brain

**Files:**
- Create: `server/_core/failoverPlanner.ts`
- Create: `server/_core/failoverPlanner.test.ts`

**Interfaces:**
- Consumes: `FailoverTopology`, `FailoverHealthEvidence`, `FailoverCoordinationContext`, `evaluateFailoverEligibility` from Task 1.
- Produces:

```ts
export type FailoverPlan = Readonly<{
  planId: string;
  planVersion: "d011c2-v1";
  tenantId: string;
  componentId: string;
  sourceNodeId: string;
  targetNodeId: string;
  topologyId: string;
  topologyGeneration: number;
  fencingToken: number;
  healthEvidenceRefs: readonly string[];
  createdAt: string;
  expiresAt: string;
  mode: "simulation";
}>;

export type FailoverPlanResult =
  | Readonly<{ planned: true; reasonCode: "FAILOVER_ELIGIBLE"; plan: FailoverPlan }>
  | Readonly<{
      planned: false;
      reasonCode:
        | FailoverEligibilityReasonCode
        | "PLAN_WINDOW_INVALID";
    }>;

export function createFailoverPlanner(options: {
  planTtlMs: number;
  createId?: () => string;
}): {
  plan(input: FailoverEligibilityInput, now?: Date): FailoverPlanResult;
};
```

- [ ] **Step 1: Create checkpoint/branch from merged C.1 `main`**

```bash
git checkout main
git pull --ff-only
BASE_SHA=$(git rev-parse HEAD)
git branch checkpoint/pre-d011c2-failover-planner-20260910 "$BASE_SHA"
git checkout -b feat/d011c2-failover-planner-20260910 "$BASE_SHA"
```

- [ ] **Step 2: Write RED planner tests**

Create `server/_core/failoverPlanner.test.ts` with deterministic `createId: () => "plan-001"`, `planTtlMs: 60_000`, fixed `now` and two healthy standby candidates `node-b`/`node-c`.

Assert lexical selection:

```ts
expect(result.planned).toBe(true);
if (result.planned) {
  expect(result.plan.targetNodeId).toBe("node-b");
  expect(result.plan.sourceNodeId).toBe("node-a");
  expect(result.plan.mode).toBe("simulation");
  expect(result.plan.healthEvidenceRefs).toEqual(["health-a", "health-b"]);
}
```

Also assert: invalid/zero/infinite `planTtlMs` throws at planner construction; no safe candidate returns eligibility rejection; expired coordination returns `COORDINATION_EXPIRED`; `expiresAt` equals the earlier of `createdAt + planTtlMs` and coordination `expiresAt`; if no positive plan window remains return `PLAN_WINDOW_INVALID`; target never equals source; topology generation and fencing copied exactly from validated input.

- [ ] **Step 3: Run RED planner suite**

```bash
corepack pnpm vitest run server/_core/failoverPlanner.test.ts
```

Expected: FAIL because module is missing.

- [ ] **Step 4: Implement minimal planner**

Create `server/_core/failoverPlanner.ts`. Call `evaluateFailoverEligibility` first; never duplicate eligibility rules. Pick `eligibility.candidates[0]` because Task 1 guarantees lexical sorting. Compute bounded expiry:

```ts
const requestedExpiresAtMs = now.getTime() + planTtlMs;
const coordinationExpiresAtMs = Date.parse(input.coordination.expiresAt);
const expiresAtMs = Math.min(requestedExpiresAtMs, coordinationExpiresAtMs);
if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
  return { planned: false, reasonCode: "PLAN_WINDOW_INVALID" };
}
```

Create `healthEvidenceRefs` exactly as `[sourceEvidenceId, targetEvidenceId]`; freeze both array and plan object.

- [ ] **Step 5: Run planner suite GREEN and harden immutability**

```bash
corepack pnpm vitest run server/_core/failoverPlanner.test.ts
```

Add one hardening assertion that `Object.isFrozen(plan)` and `Object.isFrozen(plan.healthEvidenceRefs)` are true. Re-run until GREEN.

- [ ] **Step 6: Run C.1 regression plus full gates**

```bash
corepack pnpm vitest run \
  server/_core/failoverTopology.test.ts \
  server/_core/failoverEligibility.test.ts \
  server/_core/failoverPlanner.test.ts
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

- [ ] **Step 7: Commit RED/GREEN/hardening separately**

```bash
git add server/_core/failoverPlanner.test.ts
git commit -m "test: define D-011C.2 failover planner contract"

git add server/_core/failoverPlanner.ts
git commit -m "feat: add D-011C.2 deterministic failover planner"

git add server/_core/failoverPlanner.test.ts server/_core/failoverPlanner.ts
git commit -m "test: harden D-011C.2 anti-split-brain invariants"
```

- [ ] **Step 8: Open Draft PR and stop at merge gate**

PR title: `D-011C.2 — Failover Planner & Anti-Split-Brain`.

Body must explicitly state no DB/network/infra side effects, no changes to D-011B files, exact CI evidence and changed-file scope. Do not start C.3 before approved merge.

---

### Task 3: D-011C.3 — Simulated Failover Adapter

**Files:**
- Create: `server/_core/failoverSimulation.ts`
- Create: `server/_core/simulatedFailoverAdapter.ts`
- Create: `server/_core/simulatedFailoverAdapter.test.ts`
- Create: `server/d011c3SafetyBoundary.test.ts`

**Interfaces:**
- Consumes: `FailoverPlan` from Task 2.
- Produces:

```ts
export type FailoverSimulationCapability = Readonly<{
  kind: "failover-simulation";
  version: "d011c3-v1";
}>;

export type FailoverSimulationResult = Readonly<{
  planId: string;
  sourceNodeId: string;
  targetNodeId: string;
  status: "simulated_success" | "simulated_rejected" | "simulated_failure";
  reasonCode:
    | "FAILOVER_SIMULATED_SUCCESS"
    | "SIMULATION_REJECTED"
    | "SIMULATION_FAILURE"
    | "PLAN_EXPIRED"
    | "PLAN_MISMATCH";
  startedAt: string;
  finishedAt: string;
}>;

export type FailoverSimulationPort = Readonly<{
  capability: FailoverSimulationCapability;
  execute(plan: FailoverPlan): Promise<FailoverSimulationResult>;
}>;
```

`simulatedFailoverAdapter` must be deterministic and in-memory. Its configurable mode is only `"success" | "failure"`; rejection is produced by validation, not by external dependency.

- [ ] **Step 1: Create checkpoint/branch from merged C.2 `main`**

```bash
git checkout main
git pull --ff-only
BASE_SHA=$(git rev-parse HEAD)
git branch checkpoint/pre-d011c3-simulated-failover-20260910 "$BASE_SHA"
git checkout -b feat/d011c3-simulated-failover-20260910 "$BASE_SHA"
```

- [ ] **Step 2: Write RED adapter tests**

Create `server/_core/simulatedFailoverAdapter.test.ts` using a frozen valid plan. Assert success:

```ts
const adapter = createSimulatedFailoverAdapter({
  mode: "success",
  now: () => new Date("2026-09-10T20:00:10.000Z"),
});
const result = await adapter.execute(plan);
expect(result).toMatchObject({
  planId: plan.planId,
  sourceNodeId: plan.sourceNodeId,
  targetNodeId: plan.targetNodeId,
  status: "simulated_success",
  reasonCode: "FAILOVER_SIMULATED_SUCCESS",
});
```

Also assert: expired plan -> `simulated_rejected/PLAN_EXPIRED`; malformed identity -> `simulated_rejected/PLAN_MISMATCH`; configured failure -> `simulated_failure/SIMULATION_FAILURE`; capability exactly `{kind:"failover-simulation", version:"d011c3-v1"}`; finishedAt cannot precede startedAt.

- [ ] **Step 3: Run RED adapter suite**

```bash
corepack pnpm vitest run server/_core/simulatedFailoverAdapter.test.ts
```

Expected: FAIL because modules are missing.

- [ ] **Step 4: Implement simulation contracts and in-memory adapter**

Create `failoverSimulation.ts` with types and pure validators. Create `simulatedFailoverAdapter.ts` with only imports from `./failoverSimulation` and `./failoverPlanner`. No subprocess, filesystem, DB, HTTP, cloud SDK or D-011B executor imports.

Adapter validation before success must require `plan.mode === "simulation"`, non-empty identity fields, distinct source/target, positive integer generation/fencing and unexpired `expiresAt`.

- [ ] **Step 5: Run adapter suite GREEN**

```bash
corepack pnpm vitest run server/_core/simulatedFailoverAdapter.test.ts
```

- [ ] **Step 6: Write RED static safety-boundary test**

Create `server/d011c3SafetyBoundary.test.ts`. Read the two C.3 source files as text and fail if they contain forbidden imports/tokens. The forbidden set must include:

```ts
const forbidden = [
  "child_process",
  "node:child_process",
  "node:fs",
  "axios",
  "fetch(",
  "mysql2",
  "drizzle-orm",
  "@aws-sdk",
  "kubernetes",
  "docker",
  "podman",
  "ssh",
  "recoveryExecutionBoundary",
  "RecoveryExecutorPort",
];
```

The test must inspect exactly `server/_core/failoverSimulation.ts` and `server/_core/simulatedFailoverAdapter.ts`.

- [ ] **Step 7: Run safety boundary and harden until GREEN**

```bash
corepack pnpm vitest run \
  server/_core/simulatedFailoverAdapter.test.ts \
  server/d011c3SafetyBoundary.test.ts
```

Expected: PASS with no forbidden dependency.

- [ ] **Step 8: Run full D-011C regression and gates**

```bash
corepack pnpm vitest run \
  server/_core/failoverTopology.test.ts \
  server/_core/failoverEligibility.test.ts \
  server/_core/failoverPlanner.test.ts \
  server/_core/simulatedFailoverAdapter.test.ts \
  server/d011c3SafetyBoundary.test.ts
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

- [ ] **Step 9: Commit TDD increments**

```bash
git add server/_core/simulatedFailoverAdapter.test.ts
git commit -m "test: define D-011C.3 simulated failover contract"

git add server/_core/failoverSimulation.ts server/_core/simulatedFailoverAdapter.ts
git commit -m "feat: add D-011C.3 simulated failover adapter"

git add server/d011c3SafetyBoundary.test.ts
git commit -m "test: enforce D-011C.3 simulation-only boundary"
```

- [ ] **Step 10: Open Draft PR and stop at merge gate**

PR title: `D-011C.3 — Simulated Failover Adapter`.

The PR evidence must explicitly prove absence of executor/network/DB/infra effects. Do not start C.4 before approved merge.

---

### Task 4: D-011C.4 — Failover Evidence Receipt & Verifier

**Files:**
- Create: `server/_core/failoverSimulationEvidence.ts`
- Create: `server/_core/failoverSimulationEvidence.test.ts`

**Interfaces:**
- Consumes: `FailoverPlan` from Task 2 and `FailoverSimulationResult` from Task 3.
- Produces:

```ts
export type FailoverSimulationEvidenceReceipt = Readonly<{
  eventType: "failover.simulation";
  evidenceVersion: "d011c4-v1";
  evidenceId: string;
  planId: string;
  componentId: string;
  sourceNodeId: string;
  targetNodeId: string;
  topologyId: string;
  topologyGeneration: number;
  fencingToken: number;
  healthEvidenceRefs: readonly string[];
  status: FailoverSimulationResult["status"];
  reasonCode: FailoverSimulationResult["reasonCode"];
  recordedAt: string;
  digest: string;
}>;

export function buildFailoverSimulationEvidence(input: {
  tenantId: string;
  plan: FailoverPlan;
  result: FailoverSimulationResult;
  recordedAt: string;
}):
  | Readonly<{ built: true; receipt: FailoverSimulationEvidenceReceipt }>
  | Readonly<{ built: false; reasonCode: "EVIDENCE_LINK_MISMATCH" | "EVIDENCE_TIMELINE_INVALID" | "EVIDENCE_SEMANTICS_INVALID" }>;

export function verifyFailoverSimulationEvidence(input: {
  tenantId: string;
  plan: FailoverPlan;
  receipt: FailoverSimulationEvidenceReceipt;
}):
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      reasonCode:
        | "EVIDENCE_MISMATCH"
        | "EVIDENCE_TIMELINE_INVALID"
        | "EVIDENCE_SEMANTICS_INVALID"
        | "EVIDENCE_LINK_MISMATCH";
    }>;
```

Canonical digest input must use an explicit object with fixed property order and include `tenantId` in the serialized hash context while omitting it from the exposed receipt.

- [ ] **Step 1: Create checkpoint/branch from merged C.3 `main`**

```bash
git checkout main
git pull --ff-only
BASE_SHA=$(git rev-parse HEAD)
git branch checkpoint/pre-d011c4-failover-evidence-20260910 "$BASE_SHA"
git checkout -b feat/d011c4-failover-evidence-20260910 "$BASE_SHA"
```

- [ ] **Step 2: Write RED evidence tests**

Create `server/_core/failoverSimulationEvidence.test.ts` and assert a valid receipt verifies. Use fixed tenant `tenant-a`, plan/result IDs and timestamps.

Minimum tamper cases:

```ts
expect(verifyFailoverSimulationEvidence({
  tenantId: "tenant-b",
  plan,
  receipt,
})).toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
```

Also mutate one at a time: digest, `planId`, source, target, topology generation, fencing token, `healthEvidenceRefs`, `recordedAt`; all must fail deterministically with the appropriate sanitized reason.

Add semantic matrix assertions:

```ts
const validPairs = [
  ["simulated_success", "FAILOVER_SIMULATED_SUCCESS"],
  ["simulated_rejected", "PLAN_EXPIRED"],
  ["simulated_rejected", "PLAN_MISMATCH"],
  ["simulated_rejected", "SIMULATION_REJECTED"],
  ["simulated_failure", "SIMULATION_FAILURE"],
] as const;
```

Any other status/reason pair must be `EVIDENCE_SEMANTICS_INVALID`.

- [ ] **Step 3: Run RED evidence suite**

```bash
corepack pnpm vitest run server/_core/failoverSimulationEvidence.test.ts
```

Expected: FAIL because module is missing.

- [ ] **Step 4: Implement canonical builder/verifier**

Use only `createHash` from `node:crypto` plus Task 2/3 types. Canonical hashing helper:

```ts
function digestCanonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
```

Do not hash arbitrary receipt object order. Build a fixed canonical object in the same property order in builder and verifier. Include `tenantId` first in hash context, followed by event/version/evidence/plan/component/source/target/topology/generation/fencing/health refs/status/reason/recordedAt.

`evidenceId` must be deterministic from the digest: `evidence:${digest}`. To avoid circular hashing, compute a content digest without `evidenceId`/`digest`, then set both `evidenceId` and `digest` from that content digest; verifier reconstructs the same content object.

- [ ] **Step 5: Enforce link/timeline semantics**

Builder must reject unless result identity matches plan exactly. `recordedAt` must be parseable and not precede result `finishedAt`. `healthEvidenceRefs` must be copied exactly from the plan and frozen. No receipt on invalid input.

- [ ] **Step 6: Run evidence suite GREEN and harden**

```bash
corepack pnpm vitest run server/_core/failoverSimulationEvidence.test.ts
```

Add hardening tests for changed array order and one-character tenant change; both must invalidate digest verification.

- [ ] **Step 7: Run all D-011C tests plus full repository gates**

```bash
corepack pnpm vitest run \
  server/_core/failoverTopology.test.ts \
  server/_core/failoverEligibility.test.ts \
  server/_core/failoverPlanner.test.ts \
  server/_core/simulatedFailoverAdapter.test.ts \
  server/d011c3SafetyBoundary.test.ts \
  server/_core/failoverSimulationEvidence.test.ts
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

- [ ] **Step 8: Commit RED/GREEN/hardening separately**

```bash
git add server/_core/failoverSimulationEvidence.test.ts
git commit -m "test: define D-011C.4 failover evidence contract"

git add server/_core/failoverSimulationEvidence.ts
git commit -m "feat: add D-011C.4 failover evidence receipt verifier"

git add server/_core/failoverSimulationEvidence.test.ts server/_core/failoverSimulationEvidence.ts
git commit -m "test: harden D-011C.4 evidence integrity"
```

- [ ] **Step 9: Open Draft PR and stop at merge gate**

PR title: `D-011C.4 — Failover Evidence Receipt & Verifier`.

Before asking for merge approval, compare base/head and prove the diff contains only D-011C.4 files, all exact-head workflows are GREEN and no runtime infrastructure integration exists.

---

### Task 5: D-011C Formal Closure — Documentation Only

**Files:**
- Create: `docs/releases/d011c-failover-verification.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes merged PR evidence from C.1–C.4.
- Produces no runtime behavior.

- [ ] **Step 1: Start only after C.4 is merged and `main` is GREEN**

Create checkpoint/branch:

```bash
git checkout main
git pull --ff-only
BASE_SHA=$(git rev-parse HEAD)
git branch checkpoint/pre-d011c-closure-20260910 "$BASE_SHA"
git checkout -b docs/d011c-failover-closure-20260910 "$BASE_SHA"
```

- [ ] **Step 2: Write verification report**

`docs/releases/d011c-failover-verification.md` must include: C.1–C.4 PR numbers/heads/merge SHAs, files introduced, RED/GREEN history, final full test count, workflow run numbers, architecture summary, reason codes, anti-split-brain invariants, explicit forbidden effects and statement that no productive failover was enabled.

- [ ] **Step 3: Update `CHANGELOG.md` under `Unreleased`**

Add concise D-011C entry: topology/eligibility, planner, simulated adapter, evidence verifier, simulation-only boundary; do not claim productive failover.

- [ ] **Step 4: Verify documentation-only diff**

```bash
git diff --name-only "$BASE_SHA"...HEAD
```

Expected exactly:

```text
CHANGELOG.md
docs/releases/d011c-failover-verification.md
```

- [ ] **Step 5: Run final gates on closure head**

```bash
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

Open Draft PR titled `D-011C — Failover Simulation Safety & Evidence Closure`, wait for exact-head GitHub workflows, and merge only after explicit user approval.

---

## Self-Review Checklist Applied to This Plan

- Spec coverage: every domain requirement maps to Task 1–4; formal closure maps to Task 5.
- Safety coverage: no task modifies D-011B execution/action contracts; C.3 has a static forbidden-import boundary.
- Split-brain coverage: single-active, source incident evidence, distinct target, healthy target, exact generation, positive fencing, tenant/component isolation, deterministic selection, bounded plan lifetime.
- Temporal coverage: health validity, coordination expiry, plan TTL and evidence timeline are all tested.
- Integrity coverage: C.4 hashes canonical fixed-order content including tenant hash context and all cross-links.
- No persistence/migration/network/cloud executor is introduced.
- No placeholder implementation steps remain; every runtime task names exact files, interfaces, test commands and expected RED/GREEN behavior.
- PR sequencing is serial by design: C.2 starts only after C.1 merge; C.3 after C.2; C.4 after C.3; closure after C.4.

## Execution Rule

In this ChatGPT environment, execute this plan **inline with checkpoints** using `superpowers:executing-plans`, because no subagent execution tool is available here. If the work is moved to Codex with subagent support, `superpowers:subagent-driven-development` is the preferred execution mode.
