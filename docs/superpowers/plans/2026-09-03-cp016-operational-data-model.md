# CP-016 Operational Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o AXE Dispatch com jornada auditável, presença operacional, trilhas de deslocamento e integração embutida do NEO sem quebrar o modelo atual.

**Architecture:** A implementação será aditiva. O snapshot de jornada em `teams` e a telemetria em `team_locations` permanecem; novas tabelas passam a registrar histórico e estado derivado. O motor de elegibilidade consumirá presença operacional e localização recente, mantendo regras puras testáveis separadas das consultas ao banco.

**Tech Stack:** TypeScript 5.9, Node.js, Express/tRPC, Drizzle ORM, MySQL, Vitest, React 19.

**Spec:** `docs/cp-016-operational-data-model.md`

## Global Constraints

- Preservar compatibilidade funcional com AXE Dispatch v1.15.0.
- Não remover colunas ou tabelas nesta etapa.
- Datas persistidas em UTC.
- Alterações de jornada e disponibilidade administrativa devem gerar auditoria.
- Credenciais do NEO não podem ser persistidas na configuração de iframe.
- Reutilizar `team_locations` como fonte das coordenadas.
- Equipe fora da jornada ou pausada nunca é elegível para despacho automático.
- Cada tarefa de produção deve começar por teste falhando e seguir RED → GREEN → REFACTOR.

---

### Task 1: Contratos compartilhados de jornada e presença

**Files:**
- Modify: `shared/operations.ts`
- Create: `shared/operations.cp016.test.ts`

**Interfaces:**
- Produces: `SHIFT_TEMPLATE_KINDS`, `WORK_SESSION_STATUSES`, `OPERATIONAL_PRESENCE_STATUSES` e tipos correspondentes.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  SHIFT_TEMPLATE_KINDS,
  WORK_SESSION_STATUSES,
  OPERATIONAL_PRESENCE_STATUSES,
} from "./operations";

describe("CP-016 operational contracts", () => {
  it("declares the supported shift template kinds", () => {
    expect(SHIFT_TEMPLATE_KINDS).toEqual(["fixed", "12x36", "custom"]);
  });

  it("declares work-session lifecycle statuses", () => {
    expect(WORK_SESSION_STATUSES).toEqual(["open", "paused", "closed", "adjusted"]);
  });

  it("declares dispatch presence statuses", () => {
    expect(OPERATIONAL_PRESENCE_STATUSES).toEqual([
      "available",
      "busy",
      "paused",
      "offline",
      "out_of_shift",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run shared/operations.cp016.test.ts`
Expected: FAIL because the exported constants do not exist.

- [ ] **Step 3: Implement minimal shared contracts**

Add exact readonly arrays and inferred union types to `shared/operations.ts`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm vitest run shared/operations.cp016.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/operations.ts shared/operations.cp016.test.ts
git commit -m "feat: add CP-016 operational contracts"
```

---

### Task 2: Schema Drizzle aditivo

**Files:**
- Modify: `drizzle/schema.ts`
- Test: `server/schema.cp016.test.ts`

**Interfaces:**
- Produces tables: `shiftTemplates`, `shiftSchedules`, `workSessions`, `workSessionEvents`, `operationalPresence`, `routeTracks`, `routeTrackPoints`, `embeddedIntegrations`.

- [ ] **Step 1: Write a failing schema contract test**

```ts
import { describe, expect, it } from "vitest";
import {
  shiftTemplates,
  shiftSchedules,
  workSessions,
  workSessionEvents,
  operationalPresence,
  routeTracks,
  routeTrackPoints,
  embeddedIntegrations,
} from "../drizzle/schema";

describe("CP-016 database schema", () => {
  it("exports all additive CP-016 tables", () => {
    expect(shiftTemplates).toBeDefined();
    expect(shiftSchedules).toBeDefined();
    expect(workSessions).toBeDefined();
    expect(workSessionEvents).toBeDefined();
    expect(operationalPresence).toBeDefined();
    expect(routeTracks).toBeDefined();
    expect(routeTrackPoints).toBeDefined();
    expect(embeddedIntegrations).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run server/schema.cp016.test.ts`
Expected: FAIL due to missing exports.

- [ ] **Step 3: Implement the additive tables**

Use `int`, `varchar`, `timestamp`, `boolean`, `json`, `mysqlEnum`, indexes and FKs following existing conventions. Do not remove or rename existing `teams` shift fields or `teamLocations`.

- [ ] **Step 4: Run test to verify GREEN and typecheck**

Run: `pnpm vitest run server/schema.cp016.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add drizzle/schema.ts server/schema.cp016.test.ts
git commit -m "feat: add CP-016 operational schema"
```

---

### Task 3: Migration MySQL gerada pelo Drizzle

**Files:**
- Create: next generated `drizzle/0003_*.sql`
- Modify: `drizzle/meta/_journal.json`
- Create/modify: corresponding Drizzle snapshot in `drizzle/meta/`

**Interfaces:**
- Consumes: schema from Task 2.
- Produces: reversible-by-application additive migration.

- [ ] **Step 1: Generate migration**

Run: `pnpm drizzle-kit generate`
Expected: a new migration creating only CP-016 objects/indexes/constraints.

- [ ] **Step 2: Inspect migration for destructive SQL**

Reject the migration if it contains `DROP TABLE`, `DROP COLUMN`, or destructive renames.

- [ ] **Step 3: Apply migration in development database**

Run: `pnpm drizzle-kit migrate`
Expected: successful migration.

- [ ] **Step 4: Run typecheck and tests**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add drizzle
git commit -m "db: add CP-016 operational migration"
```

---

### Task 4: Pure eligibility rule for dispatch

**Files:**
- Create: `server/dispatchEligibility.ts`
- Create: `server/dispatchEligibility.test.ts`

**Interfaces:**
- Produces: `evaluateDispatchEligibility(candidate, context)` returning `{ eligible: boolean; reasons: string[] }`.

- [ ] **Step 1: Write failing tests for hard exclusions**

```ts
import { describe, expect, it } from "vitest";
import { evaluateDispatchEligibility } from "./dispatchEligibility";

const base = {
  inShift: true,
  availableForDispatch: true,
  presenceStatus: "available" as const,
  scopeAllowed: true,
  skillAllowed: true,
  regionAllowed: true,
  hasFreshLocation: true,
};

describe("dispatch eligibility", () => {
  it("rejects a team outside its shift", () => {
    expect(evaluateDispatchEligibility({ ...base, inShift: false })).toEqual({
      eligible: false,
      reasons: ["out_of_shift"],
    });
  });

  it("rejects a paused team even when it is geographically close", () => {
    expect(evaluateDispatchEligibility({ ...base, presenceStatus: "paused" })).toEqual({
      eligible: false,
      reasons: ["paused"],
    });
  });

  it("accepts a fully eligible candidate", () => {
    expect(evaluateDispatchEligibility(base)).toEqual({ eligible: true, reasons: [] });
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run server/dispatchEligibility.test.ts`
Expected: FAIL because module/function is missing.

- [ ] **Step 3: Implement the minimal pure evaluator**

Hard-exclusion order: scope → shift → dispatch flag → presence → skill → region → fresh location. Do not calculate distance in this function.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run server/dispatchEligibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/dispatchEligibility.ts server/dispatchEligibility.test.ts
git commit -m "feat: add dispatch eligibility rules"
```

---

### Task 5: Jornada auditável e compatibilidade com snapshot atual

**Files:**
- Modify: `server/db.ts`
- Modify: `server/teamShift.test.ts`
- Create: `server/workSessions.test.ts`

**Interfaces:**
- Consumes: `workSessions`, `workSessionEvents`, `operationalPresence`, existing `teams` fields.
- Produces: transactional helpers for start/pause/resume/end and administrative adjustment.

- [ ] **Step 1: Add failing tests**

Tests must prove that start/pause/resume/end still return the current `teams` snapshot patch and also define the expected event type for historical persistence. Add a separate test proving an administrative adjustment requires a non-empty reason.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run server/teamShift.test.ts server/workSessions.test.ts`
Expected: FAIL on new historical behavior.

- [ ] **Step 3: Implement transaction helpers**

Each action must update the current `teams` snapshot and append `work_session_events`; administrative adjustments also append `audit_logs`.

- [ ] **Step 4: Verify GREEN and regression suite**

Run: `pnpm vitest run server/teamShift.test.ts server/workSessions.test.ts && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server/teamShift.test.ts server/workSessions.test.ts
git commit -m "feat: persist auditable work sessions"
```

---

### Task 6: Presence materialized for dispatch

**Files:**
- Modify: `server/db.ts`
- Create: `server/operationalPresence.test.ts`

**Interfaces:**
- Produces: `upsertOperationalPresence` and query for eligible team candidates.

- [ ] **Step 1: Write failing tests**

Cover transitions to `available`, `paused`, `busy`, `offline`, `out_of_shift` and ensure `availableForDispatch` is false for paused/offline/out-of-shift states.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run server/operationalPresence.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement presence synchronization**

Synchronize presence after shift changes and relevant team status changes. Preserve current `teams.status` behavior for compatibility.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run server/operationalPresence.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server/operationalPresence.test.ts
git commit -m "feat: materialize dispatch presence"
```

---

### Task 7: Route tracks over existing location history

**Files:**
- Modify: `server/db.ts`
- Create: `server/routeTracks.test.ts`

**Interfaces:**
- Consumes: `teamLocations`.
- Produces: create/append/close route-track helpers without duplicating coordinates.

- [ ] **Step 1: Write failing tests**

Prove that track points reference a `team_location_id`, sequence must increase, and closing a track records duration/status without deleting location history.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run server/routeTracks.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement helpers**

Keep coordinates only in `team_locations`; `route_track_points` stores linkage and sequence.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run server/routeTracks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server/routeTracks.test.ts
git commit -m "feat: add route tracking history"
```

---

### Task 8: NEO embedded integration configuration

**Files:**
- Modify: `server/db.ts`
- Modify: tRPC router file containing integration procedures
- Create: `server/embeddedIntegrations.test.ts`

**Interfaces:**
- Produces procedures to list/read/update embedded integration settings.

- [ ] **Step 1: Write failing security/configuration tests**

Tests must require an HTTPS URL, reject credential-bearing URLs (`user:pass@host`), validate `allowedRoles`, and prove the default NEO URL can be stored as `https://gscprj.saas.digitro.cloud/neo/`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run server/embeddedIntegrations.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement persistence and audited mutations**

Admin/supervisor access only for configuration; ordinary permitted roles may read enabled entries. Any URL/enablement change appends `audit_logs`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run server/embeddedIntegrations.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server/embeddedIntegrations.test.ts server
git commit -m "feat: add embedded NEO integration settings"
```

---

### Task 9: Reset, retention boundaries and compatibility

**Files:**
- Modify: `server/db.ts`
- Modify/Create: reset tests covering CP-016 tables

**Interfaces:**
- Consumes: all new CP-016 tables.
- Produces: predictable solution-reset impact/count behavior.

- [ ] **Step 1: Write failing reset tests**

Require the reset preview to include counts for work sessions, events, presence, route tracks/points and embedded integrations according to operational vs total reset scope.

- [ ] **Step 2: Verify RED**

Run the focused reset test suite.
Expected: FAIL because CP-016 tables are absent from reset behavior.

- [ ] **Step 3: Implement reset ordering**

Delete child rows before parents and preserve audit records according to current reset policy. Do not add location-retention deletion automation in this task.

- [ ] **Step 4: Verify GREEN and full suite**

Run: `pnpm check && pnpm test && pnpm security:check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "chore: integrate CP-016 into reset and security checks"
```

---

### Task 10: Release checkpoint and rollback evidence

**Files:**
- Modify: `todo.md`
- Modify/Create: release notes/checkpoint document following current repository convention
- Modify: `package.json` only after all checks pass and semantic version impact is decided

**Interfaces:**
- Produces: recoverable CP-016 checkpoint.

- [ ] **Step 1: Run final verification**

Run:

```bash
pnpm check
pnpm test
pnpm security:check
pnpm build
```

Expected: all commands succeed without regressions.

- [ ] **Step 2: Verify migration is additive**

Inspect the generated CP-016 migration and document absence of destructive statements.

- [ ] **Step 3: Record rollback procedure**

Rollback application behavior by disabling consumption of CP-016 tables; retain new historical tables/data. Do not drop tables as part of emergency rollback.

- [ ] **Step 4: Update project tracking/versioning**

Mark only actually verified tasks complete in `todo.md`, update semantic version if this becomes a release, and record the checkpoint identifier.

- [ ] **Step 5: Commit checkpoint**

```bash
git add .
git commit -m "checkpoint: CP-016 operational data model"
```

## Self-review

- Spec coverage: jornada, 12x36, auditoria, presença, elegibilidade, localização, trilhas, iframe NEO, reset, segurança e rollback are covered.
- No destructive migration is permitted.
- Existing `teams` shift snapshot and `team_locations` remain authoritative compatibility surfaces during transition.
- Type names in later tasks match the schema/interface names defined earlier.
