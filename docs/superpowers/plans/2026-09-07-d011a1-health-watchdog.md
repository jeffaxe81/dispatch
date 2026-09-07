# D-011A.1 Health Registry + Passive Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Every functional change follows TDD RED → GREEN and is committed only after the focused scope is GREEN.

**Goal:** Evolve the existing operational-health foundation into a typed health registry plus passive watchdog with readiness semantics, stale/unknown evidence, transition detection, anti-flapping and sanitized observability, without any automatic recovery action.

**Architecture:** Keep `server/_core/operationalHealth.ts` as the HTTP boundary and reuse the existing DB/storage probes. Introduce a generic registry responsible for component definitions and snapshot aggregation, plus an in-process passive watchdog responsible only for scheduled probing, hysteresis and transition emission. `/health/live` remains dependency-free. `/health/ready` remains a minimal public endpoint. Detailed snapshots are exposed later through the Super Administrator governance router in D-011A.2. `server/_core/heartbeat.ts` is not used as the internal watchdog.

**Tech Stack:** TypeScript 5.9, Node 24, Express 4, Drizzle ORM, Zod 4 where schema validation is useful, Vitest 2, pnpm 10.

**Spec:** `docs/superpowers/specs/2026-09-07-d011a-health-watchdog-story-state-design.md`

## Global Constraints

- No restart, failover, rollback, process kill, DB repair or business-data mutation.
- No new database migration in D-011A.1.
- `/health/live` must never depend on DB, storage, GIS, NEO or Internet.
- `/health/ready` fails closed only for components explicitly marked `blocksReadiness`.
- Public health responses must not expose connection strings, signed URLs, stack traces, tokens, hostnames or raw exception text.
- No fake GIS/NEO probe: only register a component when a real, safe probe exists. The registry must support optional/degraded components without inventing them.
- Probe execution must have per-component timeout, prevent overlapping watchdog cycles and not keep Node alive solely because of the timer (`unref`).
- `server/_core/heartbeat.ts` remains unchanged and semantically separate.
- One Git writer integrates commits; candidate tree is frozen before final gates.

---

## File Map

**Create**
- `server/_core/healthRegistry.ts`
- `server/_core/healthRegistry.test.ts`
- `server/_core/healthWatchdog.ts`
- `server/_core/healthWatchdog.test.ts`

**Modify**
- `server/_core/operationalHealth.ts`
- `server/_core/operationalHealth.test.ts`
- `server/_core/index.ts`

**Explicitly unchanged**
- `server/_core/heartbeat.ts`
- database schema/migrations

---

### Task 1: Define the typed health contract and registry

**Files:**
- Create: `server/_core/healthRegistry.ts`
- Create: `server/_core/healthRegistry.test.ts`

**Required public types:**

```ts
export type HealthState = "healthy" | "degraded" | "unhealthy" | "unknown";
export type HealthCriticality = "critical" | "operational" | "optional";

export type HealthComponentDefinition = {
  id: string;
  name: string;
  criticality: HealthCriticality;
  blocksReadiness: boolean;
  timeoutMs: number;
  evidenceTtlMs: number;
  probe: () => Promise<"healthy" | "degraded">;
};

export type HealthComponentSnapshot = {
  id: string;
  name: string;
  state: HealthState;
  criticality: HealthCriticality;
  blocksReadiness: boolean;
  checkedAt: string | null;
  durationMs: number | null;
};

export type HealthSnapshot = {
  status: "ready" | "degraded" | "not_ready";
  checkedAt: string;
  components: HealthComponentSnapshot[];
};
```

- [ ] **Step 1: RED — closed component definitions**

Write tests proving duplicate IDs, blank IDs, non-positive timeout and non-positive evidence TTL are rejected.

Run:

```bash
pnpm vitest run --config vitest.config.ts server/_core/healthRegistry.test.ts
```

Expected: FAIL because `healthRegistry.ts` does not exist.

- [ ] **Step 2: Implement minimal registry validation**

Implement `createHealthRegistry(definitions)` and expose a read-only definitions list. Do not encode MySQL/storage details in this file.

- [ ] **Step 3: RED — execute probes with per-component timeout**

Tests must include one healthy probe, one degraded probe, one rejected probe and one never-resolving probe.

Rejected/timeout probes map to `unhealthy`; raw exception details are discarded from the public snapshot.

- [ ] **Step 4: Implement `probeAll(now?)`**

Use `Promise.all`/`Promise.allSettled` with isolated timeout per definition. Capture duration but never exception message in the snapshot.

- [ ] **Step 5: RED — readiness aggregation**

Cases:
- all critical components healthy => `ready`;
- optional/operational component degraded => `degraded`, HTTP readiness still serviceable;
- readiness-blocking component unhealthy => `not_ready`;
- readiness-blocking component unknown/stale => `not_ready`;
- non-blocking unknown => at most `degraded`.

- [ ] **Step 6: Implement aggregation and stale evidence evaluation**

Expose a pure function for applying `evidenceTtlMs` to a stored snapshot so clock-based tests can be deterministic.

- [ ] **Step 7: Run GREEN**

```bash
pnpm vitest run --config vitest.config.ts server/_core/healthRegistry.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 8: Commit**

```bash
git add server/_core/healthRegistry.ts server/_core/healthRegistry.test.ts
git commit -m "feat(d011a): add typed health registry"
```

---

### Task 2: Adapt the existing DB/storage probes into the registry

**Files:**
- Modify: `server/_core/operationalHealth.ts`
- Modify: `server/_core/operationalHealth.test.ts`
- Reuse: `server/_core/healthRegistry.ts`

- [ ] **Step 1: RED — preserve current probe behavior**

Keep existing tests proving:
- DB uses a minimal `SELECT 1`;
- storage reads only a sentinel range and never writes;
- missing storage key/signed URL fails safely;
- storage timeout aborts the fetch.

Add RED tests for `createOperationalHealthRegistry()` definitions:

```ts
expect(definitions.map(d => d.id)).toEqual(["database", "storage"]);
expect(database.blocksReadiness).toBe(true);
expect(storage.blocksReadiness).toBe(true);
```

- [ ] **Step 2: Implement registry adapter**

Add `createOperationalHealthRegistry(options?)` using existing `checkDatabaseReady` and `checkStorageReady` as probes. Successful checks map to `healthy`; exceptions stay inside the adapter boundary.

- [ ] **Step 3: Keep compatibility helper**

If `evaluateReadiness` remains exported for existing callers/tests, implement it as a compatibility wrapper over the new registry instead of maintaining a second readiness algorithm.

- [ ] **Step 4: Run focused GREEN**

```bash
pnpm vitest run --config vitest.config.ts server/_core/operationalHealth.test.ts server/_core/healthRegistry.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor(d011a): route operational health through registry"
```

---

### Task 3: Preserve minimal public liveness/readiness HTTP semantics

**Files:**
- Modify: `server/_core/operationalHealth.ts`
- Modify: `server/_core/operationalHealth.test.ts`

**Public contract:**

`GET /health/live`

```json
{ "status": "alive" }
```

`GET /health/ready` returns only sanitized aggregate/component states required by infrastructure; no raw diagnostic strings.

- [ ] **Step 1: RED — liveness remains dependency-independent**

Use rejecting DB/storage mocks and assert `/health/live` is still HTTP 200 and neither probe was invoked.

- [ ] **Step 2: RED — degraded vs not-ready HTTP behavior**

Add test fixture with a non-blocking degraded component: response remains HTTP 200 with aggregate `degraded`.

Add readiness-blocking unhealthy fixture: HTTP 503.

- [ ] **Step 3: Implement route mapping**

Map `ready|degraded` to HTTP 200 and `not_ready` to HTTP 503. Set `Cache-Control: no-store` on both endpoints.

- [ ] **Step 4: RED — sanitization attack strings**

Probe errors include fake `mysql://user:pass@host`, `Bearer secret`, signed URL and stack text. Assert none appears in serialized public response.

- [ ] **Step 5: GREEN focused HTTP tests**

```bash
pnpm vitest run --config vitest.config.ts server/_core/operationalHealth.test.ts
```

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(d011a): expose registry-backed readiness safely"
```

---

### Task 4: Build the passive watchdog and anti-flapping policy

**Files:**
- Create: `server/_core/healthWatchdog.ts`
- Create: `server/_core/healthWatchdog.test.ts`

**Required interface:**

```ts
export type HealthHysteresisPolicy = {
  failuresToUnhealthy: number;
  successesToRecover: number;
  cooldownMs: number;
};

export type HealthTransition = {
  componentId: string;
  from: HealthState;
  to: HealthState;
  occurredAt: string;
};

export function createPassiveHealthWatchdog(options: {
  registry: HealthRegistry;
  intervalMs: number;
  policy: HealthHysteresisPolicy;
  onTransition?: (transition: HealthTransition) => void;
}): PassiveHealthWatchdog;
```

- [ ] **Step 1: RED — no transition on a single transient failure**

With `failuresToUnhealthy = 2`, first failure must not transition healthy→unhealthy.

- [ ] **Step 2: RED — transition after threshold and recover after success threshold**

Prove both directions with deterministic fake clock/probe sequence.

- [ ] **Step 3: RED — dedup and cooldown**

Repeated same-state probe results must not emit repeated transitions. A transition inside cooldown must remain suppressed according to policy.

- [ ] **Step 4: Implement pure state machine first**

Keep hysteresis logic separate from `setInterval` so most tests do not need timers.

- [ ] **Step 5: RED — prevent overlapping cycles**

A slow probe cycle followed by timer tick must not launch a second concurrent cycle.

- [ ] **Step 6: Implement scheduler**

`start()` creates a timer, `stop()` clears it; timer uses `unref()` when available. No callback may perform recovery actions.

- [ ] **Step 7: RED — stale evidence becomes unknown**

Advance clock beyond evidence TTL and assert snapshot reports `unknown`; for readiness-blocking components aggregate becomes `not_ready`.

- [ ] **Step 8: Run GREEN**

```bash
pnpm vitest run --config vitest.config.ts server/_core/healthWatchdog.test.ts server/_core/healthRegistry.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add server/_core/healthWatchdog.ts server/_core/healthWatchdog.test.ts
git commit -m "feat(d011a): add passive health watchdog"
```

---

### Task 5: Wire the watchdog into server bootstrap safely

**Files:**
- Modify: `server/_core/index.ts`
- Modify/add focused bootstrap test only if current test architecture supports importing startup without listening; otherwise extract a small factory into `server/_core/operationalHealth.ts` and test that factory.

- [ ] **Step 1: Refactor only enough to make startup injectable/testable**

Instantiate one registry and one watchdog. Register the HTTP routes against the same registry/watchdog snapshot source so the process does not maintain divergent health state.

- [ ] **Step 2: RED — watchdog starts once**

Test factory/bootstrap integration with injected `start` spy. Starting server health services twice must not create duplicate schedules.

- [ ] **Step 3: Implement bootstrap wiring**

Start watchdog after health objects are constructed. Preserve current `registerOperationalHealthRoutes(app)` ordering before application middleware.

- [ ] **Step 4: Assert `heartbeat.ts` remains untouched**

```bash
git diff -- server/_core/heartbeat.ts
```

Expected: empty diff.

- [ ] **Step 5: Run focused tests**

```bash
pnpm vitest run --config vitest.config.ts server/_core/healthRegistry.test.ts server/_core/healthWatchdog.test.ts server/_core/operationalHealth.test.ts
```

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(d011a): start passive watchdog with server"
```

---

### Task 6: D-011A.1 verification gate

- [ ] **Step 1: Security regression**

```bash
pnpm security:check
```

Expected: exit 0.

- [ ] **Step 2: TypeScript**

```bash
pnpm check
```

Expected: exit 0.

- [ ] **Step 3: Full unit suite**

```bash
pnpm test
```

Expected: all tests PASS; record exact file/test counts.

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected: exit 0.

- [ ] **Step 5: Freeze candidate tree**

Record `git status --short`, candidate SHA and diff against branch base. Do not proceed to approval if there are uncommitted runtime changes.

- [ ] **Step 6: Handoff to D-011A.2**

D-011A.1 provides a read-only detailed snapshot provider to the governance router. It does not itself add an unrestricted public diagnostic endpoint.

## Completion Boundary

D-011A.1 is implementation-complete only when the focused TDD cycle and full gates are fresh GREEN. That does **not** mean D-011A is approved, merged or released; D-011A.2 and the combined candidate gates remain required.