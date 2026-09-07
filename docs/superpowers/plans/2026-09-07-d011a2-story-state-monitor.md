# D-011A.2 Visual Story State Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Every functional change follows TDD RED → GREEN and is committed only after the focused scope is GREEN.

**Goal:** Add a read-only, Git-governed visual monitor that shows the Prompt Mestre state of each epic/story, when it entered that state, its previous state, current gate, evidence and allowed next states, while visibly separating engineering governance from technical health.

**Architecture:** The canonical source is `docs/governance/story-state.json`. Shared Zod contracts define the closed state machine. A validation CLI checks the current manifest and, when a base ref is supplied, validates the transition from the base manifest. The backend exposes a Super-Administrator-only tRPC `governance.overview` query that combines validated story-state data with the read-only technical health snapshot from D-011A.1. The client adds a dedicated `/administracao/governanca` page and sidebar entry visible only to Super Administrators. No runtime mutation endpoint is created in this slice.

**Tech Stack:** TypeScript 5.9, React 19, tRPC 11, Zod 4, Vitest 2, Testing Library, Wouter 3, Vite 7, pnpm 10.

**Spec:** `docs/superpowers/specs/2026-09-07-d011a-health-watchdog-story-state-design.md`

## Global Constraints

- Canonical engineering state is Git-versioned; no database table/migration in D-011A.2.
- No browser/client authority to set story state, tenant, user, evidence or gate.
- No runtime mutation procedure for story state in the first slice.
- Detailed governance/health page is Super-Administrator-only.
- State transitions fail closed; direct jumps such as `development -> approved` are rejected.
- `enteredAt` and evidence must be factual and evidence-backed; do not invent historical timestamps.
- Technical health states (`healthy/degraded/unhealthy/unknown`) and Prompt Mestre story states must be visually separated.
- No automatic grant or new migration merely to expose the page.
- CI must validate the manifest in addition to existing security/type/test/build gates.
- One Git writer owns final integration; candidate tree is frozen before approval.

---

## File Map

**Create — governance contract and canonical data**
- `shared/storyState.ts`
- `shared/storyState.test.ts`
- `docs/governance/story-state.json`
- `scripts/validate-story-state.ts`
- `scripts/validate-story-state.test.ts` if script logic is extracted into testable functions; otherwise cover comparison logic in `shared/storyState.test.ts`.

**Create — server read model**
- `server/governance/storyStateRepository.ts`
- `server/governance/storyStateRepository.test.ts`
- `server/routers/governance.ts`
- `server/routers/governance.test.ts`

**Modify — server composition**
- `server/rootRouter.ts`
- `package.json`
- `.github/workflows/quality.yml`

**Create — client**
- `client/src/components/governance/StoryStateBadge.tsx`
- `client/src/components/governance/StoryStateBadge.test.tsx`
- `client/src/pages/GovernancePage.tsx`
- `client/src/pages/GovernancePage.test.tsx`

**Modify — client routing/navigation**
- `client/src/App.tsx`
- `client/src/App.routing-and-states.test.ts`
- `client/src/components/DashboardLayout.tsx`
- `client/src/components/DashboardLayout.test.ts`

---

### Task 1: Define the closed Prompt Mestre story-state machine

**Files:**
- Create: `shared/storyState.ts`
- Create: `shared/storyState.test.ts`

**Required state set:**

```ts
export const storyStates = [
  "backlog",
  "specification",
  "development",
  "testing",
  "tests_green",
  "homologation",
  "approved",
  "ready_to_merge",
  "main",
  "released",
  "blocked",
  "cancelled",
] as const;
```

**Required manifest item shape:**

```ts
export const storyStateItemSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  state: z.enum(storyStates),
  enteredAt: z.string().datetime({ offset: true }),
  previousState: z.enum(storyStates).nullable(),
  nextAllowedStates: z.array(z.enum(storyStates)).min(1),
  gate: z.string().trim().min(1),
  evidence: z.array(z.object({
    type: z.enum(["commit", "pull_request", "workflow", "approval", "release"]),
    ref: z.string().trim().min(1),
  }).strict()),
  updatedBy: z.string().trim().min(1).optional(),
  transitionReason: z.string().trim().min(1).optional(),
}).strict();
```

- [ ] **Step 1: RED — accept all declared states and reject unknown values**

```bash
pnpm vitest run --config vitest.config.ts shared/storyState.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 2: Implement schema and `StoryState` type**

- [ ] **Step 3: RED — transition graph**

Normal path:

```text
backlog -> specification -> development -> testing -> tests_green -> homologation -> approved -> ready_to_merge -> main -> released
```

Controlled blocks:
- `development|testing|tests_green|homologation|approved|ready_to_merge -> blocked`
- `blocked -> development|testing|homologation|cancelled` only when `transitionReason` is present.
- correction regression to `development` from `testing|tests_green|homologation` only with `transitionReason`.
- `cancelled` and `released` are terminal in this slice.

Test explicit rejection of:
- `development -> approved`
- `testing -> main`
- `tests_green -> released`
- `main -> testing`

- [ ] **Step 4: Implement `getAllowedStoryTransitions` and `assertStoryTransition`**

The validator must also compare `nextAllowedStates` in the manifest against the canonical transition graph, preventing authors from widening the graph in JSON.

- [ ] **Step 5: RED — duplicate IDs and invalid evidence/date**

Create `storyStateManifestSchema` with a uniqueness refinement by `id`.

- [ ] **Step 6: Run GREEN and commit**

```bash
pnpm vitest run --config vitest.config.ts shared/storyState.test.ts
git add shared/storyState.ts shared/storyState.test.ts
git commit -m "feat(d011a): define story governance state machine"
```

---

### Task 2: Create the canonical Git manifest with evidence-backed entries

**Files:**
- Create: `docs/governance/story-state.json`

- [ ] **Step 1: Seed D-011A from evidence**

Use the approved-spec commit timestamp as evidence for the `specification` entry:

- commit: `64408f78d0d58b74316f12c389cbbf7edca83636`
- commit timestamp: `2026-09-07T15:53:04Z`

Initial D-011A item at this implementation point:

```json
{
  "id": "D-011A",
  "title": "Health & Watchdog Foundation + Visual Story State Monitor",
  "state": "development",
  "enteredAt": "<timestamp of the first implementation commit, captured after that commit exists>",
  "previousState": "specification",
  "nextAllowedStates": ["testing", "blocked"],
  "gate": "TDD implementation",
  "evidence": [
    { "type": "commit", "ref": "64408f78d0d58b74316f12c389cbbf7edca83636" }
  ]
}
```

Do **not** fill the placeholder before the first implementation commit exists. During execution, first create the contract commit from Task 1, read its exact Git timestamp, then use that exact value as `enteredAt` and include that commit in evidence. The resulting committed JSON must contain no placeholder text.

- [ ] **Step 2: Add only historical stories with verified evidence**

Recommended initial historical rows:
- D-010C — `main`, using merged PR #50 evidence;
- D-010B — `main`, using merged PR #49 evidence;
- D-008 — `released`, using release PR #46 evidence.

Before writing each row, fetch the relevant merge/release timestamp. If evidence cannot be verified, omit the row rather than guess.

- [ ] **Step 3: Validate current manifest schema**

Use a temporary focused test/import from `shared/storyState.ts` until the CLI in Task 3 exists.

- [ ] **Step 4: Commit**

```bash
git add docs/governance/story-state.json
git commit -m "docs(d011a): add Git-governed story state manifest"
```

---

### Task 3: Add fail-closed manifest/transition validation CLI

**Files:**
- Create: `scripts/validate-story-state.ts`
- Modify: `package.json`

**CLI behavior:**

```bash
pnpm governance:check
```

validates the current manifest.

```bash
GOVERNANCE_BASE_REF=main pnpm governance:check
```

also loads `docs/governance/story-state.json` from the Git base ref and validates each changed story transition from base state to current state.

- [ ] **Step 1: RED — current manifest validation**

Extract testable helpers if necessary:

```ts
validateManifest(current)
validateManifestTransition(base, current)
```

- [ ] **Step 2: RED — forbidden jump against base**

Fixture base `development`, current `approved` must fail.

- [ ] **Step 3: RED — legitimate progress and blocked correction**

Prove `testing -> tests_green` succeeds and `blocked -> development` requires reason.

- [ ] **Step 4: Implement CLI using `git show` only when `GOVERNANCE_BASE_REF` is set**

The command must fail non-zero with a concise message; do not print file-system secrets or unrelated environment values.

- [ ] **Step 5: Add package script**

```json
"governance:check": "tsx scripts/validate-story-state.ts"
```

- [ ] **Step 6: Run GREEN**

```bash
pnpm governance:check
GOVERNANCE_BASE_REF=main pnpm governance:check
```

Expected: exit 0 for the legitimate candidate state.

- [ ] **Step 7: Commit**

```bash
git add scripts/validate-story-state.ts package.json docs/governance/story-state.json
git commit -m "ci(d011a): validate story state transitions"
```

---

### Task 4: Add a read-only server repository and Super Administrator router

**Files:**
- Create: `server/governance/storyStateRepository.ts`
- Create: `server/governance/storyStateRepository.test.ts`
- Create: `server/routers/governance.ts`
- Create: `server/routers/governance.test.ts`
- Modify: `server/rootRouter.ts`

**Repository interface:**

```ts
export type StoryStateRepository = {
  list(): Promise<StoryStateItem[]>;
  getById(id: string): Promise<StoryStateItem | null>;
};
```

The implementation reads `docs/governance/story-state.json` server-side and validates it before returning data. Missing/invalid manifest must fail closed with a sanitized server error.

**Router interface:**

```ts
governance.overview.query() -> {
  technicalHealth: HealthSnapshot;
  stories: StoryStateItem[];
}
```

- [ ] **Step 1: RED — repository parses valid manifest and rejects invalid/duplicate entries**

Inject the file reader/path resolver for tests rather than depending on process cwd fixtures.

- [ ] **Step 2: Implement repository**

No write/update/delete methods.

- [ ] **Step 3: RED — unauthenticated and ordinary users cannot call overview**

Use the same caller-test style as `server/routers/workspace.test.ts`.

- [ ] **Step 4: RED — Super Administrator succeeds**

Router uses `protectedProcedure` then `assertSuperAdministrator(ctx.user)` from `server/accessControl.ts`.

- [ ] **Step 5: Inject D-011A.1 health snapshot provider**

Do not expose raw probe exceptions. The router returns only the sanitized `HealthSnapshot` contract.

- [ ] **Step 6: Add to root router**

Create `governanceRoot = router({ governance: createGovernanceRouter(dependencies) })` and merge it into `rootRouter`.

- [ ] **Step 7: Run focused GREEN**

```bash
pnpm vitest run --config vitest.config.ts server/governance/storyStateRepository.test.ts server/routers/governance.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add server/governance server/routers/governance.ts server/routers/governance.test.ts server/rootRouter.ts
git commit -m "feat(d011a): expose read-only governance overview"
```

---

### Task 5: Add StoryStateBadge presentation component

**Files:**
- Create: `client/src/components/governance/StoryStateBadge.tsx`
- Create: `client/src/components/governance/StoryStateBadge.test.tsx`

- [ ] **Step 1: RED — all states render a stable Portuguese label**

Labels:
- backlog → Backlog
- specification → Especificação
- development → Em desenvolvimento
- testing → Em testes
- tests_green → Testes OK
- homologation → Em homologação
- approved → Aprovado
- ready_to_merge → Pronto para merge
- main → Integrado em main
- released → Publicado/Release
- blocked → Bloqueado
- cancelled → Cancelado

- [ ] **Step 2: RED — accessibility does not rely on color alone**

Badge must expose the textual state and optionally `aria-label`; icon/color are supplemental.

- [ ] **Step 3: Implement minimal component**

Do not couple component to fetching or authorization.

- [ ] **Step 4: Run GREEN and commit**

```bash
pnpm vitest run --config vitest.config.ts client/src/components/governance/StoryStateBadge.test.tsx
git add client/src/components/governance
git commit -m "feat(d011a): add visual story state badge"
```

---

### Task 6: Build the dedicated Governance / Platform Health page

**Files:**
- Create: `client/src/pages/GovernancePage.tsx`
- Create: `client/src/pages/GovernancePage.test.tsx`

**Page structure:**

1. Header: `Governança e Saúde da Plataforma`.
2. Section `Saúde técnica` with aggregate and component cards/table.
3. Strong visual divider.
4. Section `Estado dos épicos e histórias`.
5. Filter by story state.
6. Each story shows:
   - ID/title;
   - `StoryStateBadge`;
   - `enteredAt` formatted;
   - previous state;
   - current gate;
   - next allowed states;
   - evidence refs.
7. Blocked stories receive explicit text/icon warning, not only color.

- [ ] **Step 1: RED — loading/error/empty states**

Use `QueryState` conventions already present in project pages.

- [ ] **Step 2: RED — technical health and governance are separate sections**

Assert headings and that `healthy` technical data is not rendered as a Prompt Mestre badge.

- [ ] **Step 3: RED — story card shows entry timestamp and gate**

Use a D-011A fixture and assert `Em desenvolvimento`, formatted `enteredAt`, previous `Especificação`, gate and allowed states.

- [ ] **Step 4: RED — filter and blocked visibility**

Filter `blocked` leaves only blocked items; blocked row includes `Bloqueado` text.

- [ ] **Step 5: Implement page through `trpc.governance.overview.useQuery()`**

No mutation buttons in this slice.

- [ ] **Step 6: Run GREEN and commit**

```bash
pnpm vitest run --config vitest.config.ts client/src/pages/GovernancePage.test.tsx
git add client/src/pages/GovernancePage.tsx client/src/pages/GovernancePage.test.tsx
git commit -m "feat(d011a): add governance and health page"
```

---

### Task 7: Wire Super Administrator-only route and navigation

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/App.routing-and-states.test.ts`
- Modify: `client/src/components/DashboardLayout.tsx`
- Modify: `client/src/components/DashboardLayout.test.ts`

- [ ] **Step 1: RED — route contract**

Add `/administracao/governanca` to the explicit routes array and add `GovernancePage.tsx` to `primaryPages` so query/loading/error/empty conventions remain enforced.

- [ ] **Step 2: RED — menu visibility**

`getMenuItems([], "administrador", true)` includes `Governança`.

Ordinary administrator without `isSuperAdministrator` must not see the entry solely because legacy `*` exists.

- [ ] **Step 3: Implement route**

Import `GovernancePage` and register:

```tsx
<Route path={"/administracao/governanca"} component={GovernancePage} />
```

Server authorization remains authoritative even if route is manually entered.

- [ ] **Step 4: Implement menu entry**

Only inside `if (isSuperAdministrator)` add `Governança` before/near `Configurações`.

- [ ] **Step 5: Run focused GREEN**

```bash
pnpm vitest run --config vitest.config.ts client/src/App.routing-and-states.test.ts client/src/components/DashboardLayout.test.ts client/src/pages/GovernancePage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(d011a): wire Super Admin governance navigation"
```

---

### Task 8: Put governance validation into the existing Quality workflow

**Files:**
- Modify: `.github/workflows/quality.yml`

- [ ] **Step 1: Add manifest gate after dependency install and before generic quality gates**

```yaml
      - name: Validar governança das histórias
        env:
          GOVERNANCE_BASE_REF: ${{ github.event.pull_request.base.sha }}
        run: corepack pnpm governance:check
```

For push/workflow_dispatch where pull-request base SHA is unavailable, the CLI must still validate the current manifest and skip cross-ref comparison safely.

- [ ] **Step 2: Validate workflow syntax by inspection and existing workflow conventions**

Do not create a second competing quality workflow.

- [ ] **Step 3: Run local command**

```bash
GOVERNANCE_BASE_REF=main pnpm governance:check
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/quality.yml
git commit -m "ci(d011a): gate Prompt Master story transitions"
```

---

### Task 9: Combined D-011A candidate verification and visual state transition

**Files:**
- Modify: `docs/governance/story-state.json`
- Create: `docs/releases/d011a-verification.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Move D-011A to `testing` before final test execution**

Update manifest using a real commit timestamp/evidence. Run:

```bash
GOVERNANCE_BASE_REF=main pnpm governance:check
```

Commit only if transition is allowed.

- [ ] **Step 2: Run full final gates on frozen candidate**

```bash
pnpm governance:check
pnpm security:check
pnpm check
pnpm test
pnpm build
pnpm test:gis-visual
pnpm test:neo-visual
```

If any required local/CI gate cannot run, state that explicitly and do not transition to `tests_green`.

- [ ] **Step 3: If and only if all required test gates are GREEN, move D-011A to `tests_green`**

Set:
- `previousState: "testing"`
- `state: "tests_green"`
- `nextAllowedStates: ["homologation", "blocked"]`
- `gate: "Homologação"`
- exact `enteredAt` from the state-transition commit process/evidence.

Re-run `pnpm governance:check` after the manifest change.

- [ ] **Step 4: Document verification**

`docs/releases/d011a-verification.md` records:
- candidate SHA;
- exact unit test files/tests passed;
- governance check;
- security check;
- TypeScript;
- build;
- GIS/NEO gates;
- explicit non-actions: no deploy, migration, grant, failover, restart or rollback.

- [ ] **Step 5: Update CHANGELOG**

Describe D-011A.1 and D-011A.2 separately.

- [ ] **Step 6: Commit documentation/evidence only after fresh GREEN evidence**

- [ ] **Step 7: Open controlled PR only after candidate is frozen**

The PR should begin at `tests_green`/homologation gate, not `approved`. User/human approval remains a later state transition.

## Completion Boundary

D-011A reaches **tests_green** only with fresh verification evidence. It reaches **homologation**, **approved**, **ready_to_merge**, **main** and **released** only through explicit later gates. The visual state monitor must reflect those transitions rather than merely displaying a manually chosen optimistic status.