# Jornada Phase 1 + D-006E Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the already validated Jornada Fase 1 MVP onto the latest D-006E/GIS baseline without losing current dispatch, GIS, NEO iframe, RBAC, CSP, recovery, security, or CI behavior.

**Architecture:** The reconciliation starts from immutable checkpoint `checkpoint/d006e-csp-frame-src-20260904` at `e3bf9b4d5d7729f675b5c27122f79ea09f8efff1`. Jornada artifacts are transported from `checkpoint/jornada-mvp-phase1-visual-green-20260904` at `1e207e166d6c9ea2b7c689b4c65d7e41b586b919`; non-overlapping files are copied verbatim, while shared composition files are merged by applying only PR #24's Jornada-specific deltas. No production migration is applied.

**Tech Stack:** React 19, Vite, TypeScript, tRPC 11, Express, Drizzle ORM/MySQL, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-jornada-tempo-real-design.md`

## Global Constraints

- Preserve latest GIS/OSM/Leaflet/OSRM behavior and current dispatch ranking/ETA.
- Preserve D-006 iframe, NEO workspace, `embedded_apps.*` RBAC and strict `frame-src` CSP.
- Preserve recovery, local auth, security checks, frozen PNPM lockfile and existing CI gates.
- Do not merge to `main`, deploy, apply migrations to production, or use production credentials.
- Keep Jornada Fase 1 semantics unchanged during reconciliation: start, break, resume, end, current state, history, audit.
- Treat the dispatch/jornada eligibility filter as a separate follow-up plan after this reconciliation is green.

---

### Task 1: Reconcile Jornada domain, schema and persistence

**Files:**
- Create: `drizzle/workShiftSchema.ts`
- Create: `drizzle/0003_brave_selene.sql`
- Create: `drizzle/meta/0003_snapshot.json`
- Modify: `drizzle.config.ts`
- Modify: `drizzle/meta/_journal.json`
- Create: `server/workShiftDomain.ts`
- Create: `server/workShiftGateway.ts`
- Create: `server/workShiftPersistencePlan.ts`
- Create: `server/workShiftPersistenceAdapter.ts`
- Create: `server/workShiftService.ts`
- Create tests: matching `server/workShiftDomain.test.ts`, `workShiftGateway.test.ts`, `workShiftPersistencePlan.test.ts`, `workShiftPersistenceAdapter.test.ts`, `workShiftSchema.test.ts`, `workShiftService.test.ts`

**Interfaces:**
- Consumes: existing `users`, `auditLogs` and MySQL/Drizzle configuration.
- Produces: `WorkShiftState`, work-shift schema tables, session/history queries, and transactional persistence used by the application service.

- [ ] **Step 1: Copy only the Jornada tests and schema contract files first**

Copy the six tests above plus `drizzle/workShiftSchema.ts` from `checkpoint/jornada-mvp-phase1-visual-green-20260904`.

- [ ] **Step 2: Run targeted tests to verify the reconciliation is RED**

Run:
```bash
corepack pnpm exec vitest run --config vitest.config.ts \
  server/workShiftDomain.test.ts \
  server/workShiftGateway.test.ts \
  server/workShiftPersistencePlan.test.ts \
  server/workShiftPersistenceAdapter.test.ts \
  server/workShiftSchema.test.ts \
  server/workShiftService.test.ts
```
Expected: FAIL because the corresponding implementation modules are not yet present.

- [ ] **Step 3: Copy the matching validated Jornada implementation modules**

Copy verbatim from `checkpoint/jornada-mvp-phase1-visual-green-20260904`:
```text
server/workShiftDomain.ts
server/workShiftGateway.ts
server/workShiftPersistencePlan.ts
server/workShiftPersistenceAdapter.ts
server/workShiftService.ts
```

- [ ] **Step 4: Merge Drizzle configuration without replacing current metadata**

Change only the `schema` entry in `drizzle.config.ts` to:
```ts
schema: ["./drizzle/schema.ts", "./drizzle/workShiftSchema.ts"],
```
Append only the `0003_brave_selene` journal entry to the current `_journal.json`. Copy `0003_brave_selene.sql` and `0003_snapshot.json` verbatim. Do not alter migrations 0000-0002.

- [ ] **Step 5: Run targeted tests to verify GREEN**

Run the same Vitest command from Step 2. Expected: PASS with zero failed tests.

- [ ] **Step 6: Commit**

```bash
git add drizzle.config.ts drizzle/0003_brave_selene.sql drizzle/meta/0003_snapshot.json drizzle/meta/_journal.json drizzle/workShiftSchema.ts server/workShift*.ts
git commit -m "reconcile(jornada): transport domain schema and persistence onto d006e"
```

### Task 2: Reconcile authenticated Jornada API without losing the current root server

**Files:**
- Create: `server/workShiftApplicationService.ts`
- Create: `server/workShiftRouter.ts`
- Create: `server/workShiftRuntime.ts`
- Create: `server/rootRouter.ts`
- Create tests: `server/workShiftApplicationService.test.ts`, `workShiftRouter.test.ts`, `workShiftRouter.errors.test.ts`, `workShiftRuntime.test.ts`, `rootRouter.test.ts`
- Modify: `server/_core/index.ts`
- Modify: `client/src/lib/trpc.ts`

**Interfaces:**
- Consumes: Task 1 services/persistence and current `appRouter`.
- Produces: `rootRouter` that preserves every existing route and adds `workShift.current/history/start/break/resume/end`; `RootRouter` becomes client tRPC type.

- [ ] **Step 1: Copy API/root-router tests first**

Copy the five test files above from the validated Jornada checkpoint.

- [ ] **Step 2: Run API/root-router tests to verify RED**

Run:
```bash
corepack pnpm exec vitest run --config vitest.config.ts \
  server/workShiftApplicationService.test.ts \
  server/workShiftRouter.test.ts \
  server/workShiftRouter.errors.test.ts \
  server/workShiftRuntime.test.ts \
  server/rootRouter.test.ts
```
Expected: FAIL because `workShiftApplicationService`, `workShiftRouter`, `workShiftRuntime` and `rootRouter` are not yet present.

- [ ] **Step 3: Copy the validated API implementation files**

Copy verbatim:
```text
server/workShiftApplicationService.ts
server/workShiftRouter.ts
server/workShiftRuntime.ts
server/rootRouter.ts
```

- [ ] **Step 4: Merge `server/_core/index.ts` preserving D-006E CSP**

Keep:
```ts
import { EMBEDDED_APPLICATIONS } from "@shared/embeddedApplications";
import { createEmbeddedApplicationCspMiddleware } from "../embeddedAppCsp";
app.use(createEmbeddedApplicationCspMiddleware(EMBEDDED_APPLICATIONS));
```
Replace only the tRPC router composition:
```ts
import { rootRouter } from "../rootRouter";
...
router: rootRouter,
```
Do not copy the older Jornada `index.ts` wholesale.

- [ ] **Step 5: Switch the client tRPC type to `RootRouter`**

Change only:
```ts
import type { RootRouter } from "../../../server/rootRouter";
export const trpc = createTRPCReact<RootRouter>();
```

- [ ] **Step 6: Run API/root-router tests and TypeScript**

Run:
```bash
corepack pnpm exec vitest run --config vitest.config.ts \
  server/workShiftApplicationService.test.ts \
  server/workShiftRouter.test.ts \
  server/workShiftRouter.errors.test.ts \
  server/workShiftRuntime.test.ts \
  server/rootRouter.test.ts
corepack pnpm check
```
Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit**

```bash
git add server/workShiftApplicationService.ts server/workShiftRouter.ts server/workShiftRuntime.ts server/rootRouter.ts server/rootRouter.test.ts server/_core/index.ts client/src/lib/trpc.ts server/workShift*.test.ts
git commit -m "reconcile(jornada): compose authenticated api with current server"
```

### Task 3: Reconcile Jornada UI into the latest GIS/NEO application shell

**Files:**
- Create: `client/src/pages/WorkShiftPage.tsx`
- Create tests: `client/src/pages/WorkShiftPage.test.tsx`, `WorkShiftPage.responsive.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/DashboardLayout.tsx`
- Modify: `client/src/components/DashboardLayout.test.ts`

**Interfaces:**
- Consumes: Task 2 `workShift.*` tRPC procedures.
- Produces: `/jornada` route and always-visible Jornada navigation item without removing current GIS/NEO/D-006 routes/menu entries.

- [ ] **Step 1: Copy WorkShiftPage tests first**

Copy both page test files from the Jornada checkpoint.

- [ ] **Step 2: Run page tests to verify RED**

Run:
```bash
corepack pnpm exec vitest run --config vitest.config.ts \
  client/src/pages/WorkShiftPage.test.tsx \
  client/src/pages/WorkShiftPage.responsive.test.tsx
```
Expected: FAIL because `WorkShiftPage.tsx` is not yet present on the D-006E baseline.

- [ ] **Step 3: Copy `WorkShiftPage.tsx`**

Copy the validated page implementation verbatim from the Jornada checkpoint.

- [ ] **Step 4: Merge the route into current `App.tsx`**

Add only:
```ts
import WorkShiftPage from "@/pages/WorkShiftPage";
```
and:
```tsx
<Route path={"/jornada"} component={WorkShiftPage} />
```
Preserve all current GIS, embedded-app and NEO routes.

- [ ] **Step 5: Merge Jornada into the current sidebar**

Add `Clock3` to the current lucide import and add:
```ts
items.push({ icon: Clock3, label: "Jornada", path: "/jornada" });
```
after the agent application entry. Preserve current D-006/integration visibility rules.

- [ ] **Step 6: Merge sidebar test expectations**

Add `Jornada` expectations from PR #24 without replacing the newer D-006/sidebar tests.

- [ ] **Step 7: Run UI tests and TypeScript**

Run:
```bash
corepack pnpm exec vitest run --config vitest.config.ts \
  client/src/pages/WorkShiftPage.test.tsx \
  client/src/pages/WorkShiftPage.responsive.test.tsx \
  client/src/components/DashboardLayout.test.ts
corepack pnpm check
```
Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/WorkShiftPage* client/src/App.tsx client/src/components/DashboardLayout.tsx client/src/components/DashboardLayout.test.ts
git commit -m "reconcile(jornada): restore realtime shift ui on current shell"
```

### Task 4: Reconcile Jornada CI, visual harness and documentation

**Files:**
- Create: `.github/workflows/jornada-mvp-quality.yml`
- Create: `.github/workflows/jornada-mvp-visual.yml`
- Create: `scripts/jornada-visual-homologation.mjs`
- Create: `docs/jornada-api-checkpoint-marker.md`
- Create: `docs/jornada-api-checkpoint.md`
- Create: `docs/jornada-mvp-migration-plan.md`
- Create: `docs/superpowers/specs/2026-09-04-jornada-tempo-real-design.md`
- Create: `docs/superpowers/plans/2026-09-04-jornada-tempo-real.md`

**Interfaces:**
- Consumes: Tasks 1-3 reconciled application.
- Produces: reproducible Jornada-specific quality/visual validation while existing global GIS/NEO/Quality gates remain active.

- [ ] **Step 1: Copy the Jornada workflow, harness and docs verbatim**

Copy the files listed above from `checkpoint/jornada-mvp-phase1-visual-green-20260904`.

- [ ] **Step 2: Inspect workflow assumptions before running**

Verify the workflows use disposable runner MySQL/ephemeral local auth only; they must not use production credentials or apply migrations to production.

- [ ] **Step 3: Run the global local suite**

Run:
```bash
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
```
Expected: all commands exit 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/jornada-mvp-*.yml scripts/jornada-visual-homologation.mjs docs/jornada-* docs/superpowers/specs/2026-09-04-jornada-tempo-real-design.md docs/superpowers/plans/2026-09-04-jornada-tempo-real.md
git commit -m "reconcile(jornada): restore dedicated ci visual harness and docs"
```

### Task 5: Validate the reconciled baseline and freeze a checkpoint

**Files:**
- Modify only if evidence requires: reconciliation documentation/PR comment.
- No production files should change merely to make CI pass unless a genuine reconciliation defect is found.

**Interfaces:**
- Consumes: all prior reconciliation tasks.
- Produces: immutable checkpoint suitable as base for the separate dispatch-eligibility integration plan.

- [ ] **Step 1: Open a draft reconciliation PR against `main` only to trigger all gates**

Head:
```text
reconcile/jornada-phase1-d006e-20260904
```
Base:
```text
main
```
The PR must explicitly say this does not authorize merge.

- [ ] **Step 2: Require all applicable gates on the same final SHA**

Verify fresh `success` conclusions for:
```text
Qualidade
GIS visual homologation
NEO external compatibility
NEO workspace visual homologation
Jornada MVP quality
Jornada MVP visual homologation
```

- [ ] **Step 3: Review visual Jornada evidence**

Confirm desktop 1440×900 and mobile 390×844 still show title, current state, contextual action and recent history without horizontal overflow.

- [ ] **Step 4: Verify no regression by diff review**

Confirm shared files contain only the planned Jornada deltas and preserve D-006E CSP, NEO routes, GIS routes and current sidebar rules.

- [ ] **Step 5: Create immutable checkpoint**

Create:
```text
checkpoint/jornada-phase1-d006e-reconciled-20260904
```
from the exact final green SHA.

- [ ] **Step 6: Record evidence and stop before dispatch filtering**

Document the gate run IDs, artifact IDs/digests and final SHA. Do not implement dispatch eligibility in this reconciliation branch.

---

## Self-review

- Spec coverage: Phase 1 domain, persistence, API, UI, history, visual validation and migration metadata are all transported; current GIS/D-006 behavior is explicitly preserved.
- Scope separation: dispatch eligibility is intentionally excluded and will receive its own TDD plan after this checkpoint.
- Placeholder scan: no implementation step relies on TBD/TODO language.
- Type consistency: the reconciled client uses `RootRouter`; `rootRouter` spreads the current `appRouter` record and adds `workShift`.
