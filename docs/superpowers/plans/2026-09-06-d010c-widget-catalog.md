# D-010C Widget Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar o Workspace Operacional com nove widgets funcionais, seguros e reutilizáveis em uma ou N superfícies, preservando RBAC, tenant, integrações homologadas e compatibilidade com o D-010B.

**Architecture:** O contrato compartilhado continuará fechado em `workspaceWidgetTypes`; metadados ficam em `widgetRegistry`, renderização funcional em `widgetRendererRegistry`, e cada widget vive em componente próprio sob `client/src/workspace/widgets/`. Um contexto efêmero por superfície coordena seleção operacional sem virar autoridade de tenant; APIs continuam autorizadas no servidor.

**Tech Stack:** TypeScript 5.9, React 19, tRPC 11, Zod 4, Vitest 2, Testing Library, Vite 7.

**Spec:** `docs/superpowers/specs/2026-09-06-d010c-widget-catalog-design.md`

## Global Constraints

- Catálogo fechado: nenhum componente, script, URL ou tipo arbitrário vindo de configuração do usuário.
- Tenant e usuário nunca são autoridade por URL ou estado cliente; autorização permanece no backend/sessão.
- D-010B deve continuar compatível com superfície primária e N superfícies externas.
- `authorized-iframe` usa somente IDs presentes em `EMBEDDED_APPLICATIONS`; nenhuma URL livre em `settings`.
- `neo-communication` reutiliza `NEO_INTERACT_EMBEDDED_APPLICATION` e o fluxo já homologado.
- Sem nova autenticação/SSO do NEO.
- Sem deploy, grants automáticos ou migration aplicada em banco real.
- Desenvolvimento funcional sempre em TDD RED → GREEN; commit somente depois do GREEN do escopo da tarefa.

---

## File Structure

**Shared contracts**
- Modify `shared/workspaceLayout.ts`: novos tipos e schemas discriminados de settings.
- Reuse `shared/embeddedApplications.ts`: allowlist existente para NEO/iframe.

**Workspace composition**
- Modify `client/src/workspace/widgetRegistry.ts`: metadados/permissões dos 15 tipos totais.
- Modify `client/src/workspace/widgetRegistry.test.ts`: catálogo fechado e RBAC.
- Create `client/src/workspace/widgetRendererRegistry.tsx`: resolução tipo → renderer.
- Create `client/src/workspace/widgetRendererRegistry.test.tsx`: resolução e rejeição de desconhecidos.
- Create `client/src/workspace/WorkspaceWidgetFrame.tsx`: moldura/estados/isolamento local.
- Create `client/src/workspace/WorkspaceWidgetFrame.test.tsx`.
- Modify `client/src/workspace/WorkspaceScreenCanvas.tsx`: montar renderers sem regra de negócio.
- Create `client/src/workspace/WorkspaceScreenCanvas.test.tsx`: regressão primária/externa e falha isolada.

**Context**
- Create `client/src/workspace/context/WorkspaceSurfaceContext.tsx`.
- Create `client/src/workspace/context/WorkspaceSurfaceContext.test.tsx`.

**Widgets**
- Create `client/src/workspace/widgets/KanbanWidget.tsx`
- Create `client/src/workspace/widgets/IncidentDetailWidget.tsx`
- Create `client/src/workspace/widgets/ResourcesWidget.tsx`
- Create `client/src/workspace/widgets/SlaAlertsWidget.tsx`
- Create `client/src/workspace/widgets/OperationalTimelineWidget.tsx`
- Create `client/src/workspace/widgets/NeoCommunicationWidget.tsx`
- Create `client/src/workspace/widgets/AuthorizedIframeWidget.tsx`
- Create `client/src/workspace/widgets/DynamicFormWidget.tsx`
- Create `client/src/workspace/widgets/ConfigurableDashboardWidget.tsx`
- Create paired `*.test.tsx` files for each renderer.

**Server reuse / additions only when required**
- Modify `server/routers.ts` only where an existing query cannot safely expose the exact read model required by a widget.
- Prefer existing `incidents`, `teams`, `dashboard`, `forms`, `integrations.embeddedApplications` and timeline endpoints before adding any procedure.

---

### Task 1: Extend the closed widget contract and typed settings

**Files:**
- Modify: `shared/workspaceLayout.ts`
- Test: create `shared/workspaceLayout.d010c.test.ts`

**Interfaces:**
- Produces `WorkspaceWidgetType` including: `kanban`, `incident-detail`, `resources`, `sla-alerts`, `neo-communication`, `operational-timeline`, `dynamic-form`, `configurable-dashboard`, `authorized-iframe`.
- Produces `parseWorkspaceWidgetSettings(type, settings)` returning normalized settings or safe defaults.

- [ ] **Step 1: Write failing contract tests**

```ts
expect(workspaceWidgetTypes).toEqual(expect.arrayContaining([
  "kanban", "incident-detail", "resources", "sla-alerts",
  "neo-communication", "operational-timeline", "dynamic-form",
  "configurable-dashboard", "authorized-iframe",
]));
expect(() => workspaceWidgetInstanceSchema.parse({
  instanceId: "bad", type: "remote-component", x: 0, y: 0, w: 4, h: 4, settings: {},
})).toThrow();
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run --config vitest.config.ts shared/workspaceLayout.d010c.test.ts`
Expected: FAIL because D-010C types/settings parser do not exist.

- [ ] **Step 3: Add types and strict settings schemas**

Implement schemas with these safe shapes:

```ts
kanban: { statuses?: string[]; priorities?: string[] }
"incident-detail": { compact?: boolean }
resources: { includeVehicles?: boolean }
"sla-alerts": { riskMinutes?: number }
"neo-communication": { applicationId: "neo-interact" }
"operational-timeline": { mode?: "summary" | "full" }
"dynamic-form": { formId?: number }
"configurable-dashboard": { metricKeys?: string[] }
"authorized-iframe": { applicationId: string }
```

Reject unknown keys and normalize omitted values to documented defaults.

- [ ] **Step 4: Run GREEN**

Run the same focused command; expected PASS.

- [ ] **Step 5: Regression normalization**

Run: `pnpm test -- --runInBand` if supported by local Vitest invocation; otherwise `pnpm test`.
Expected: existing D-010A/B layouts remain valid.

- [ ] **Step 6: Commit**

`git commit -m "feat: extend workspace widget contract for D-010C"`

---

### Task 2: Expand registry metadata and permission filtering

**Files:**
- Modify: `client/src/workspace/widgetRegistry.ts`
- Modify: `client/src/workspace/widgetRegistry.test.ts`

**Interfaces:**
- Keeps `getWorkspaceWidgetDefinition(type)`.
- Keeps `listAllowedWorkspaceWidgets(permissions)`.
- Adds metadata for all nine D-010C types.

- [ ] **Step 1: Change the existing six-widget test to expect all 15 closed types**
- [ ] **Step 2: Add RED permission cases**

Required permission baseline:
- occurrence widgets: `occurrences.view`
- resources: `teams.view`
- NEO/iframe: `embedded_apps.view` (not merely visual hiding)
- dynamic form: read permission already used by D-008
- dashboard: permissions of its data source; initial registry gate `occurrences.view`

- [ ] **Step 3: Run RED**

`pnpm vitest run --config vitest.config.ts client/src/workspace/widgetRegistry.test.ts`

- [ ] **Step 4: Implement minimal registry entries**
Use explicit default/min sizes; no dynamic imports or remote names.

- [ ] **Step 5: Run GREEN and commit**

`git commit -m "feat: register D-010C workspace widgets"`

---

### Task 3: Add renderer registry and common widget frame

**Files:**
- Create: `client/src/workspace/widgetRendererRegistry.tsx`
- Create: `client/src/workspace/widgetRendererRegistry.test.tsx`
- Create: `client/src/workspace/WorkspaceWidgetFrame.tsx`
- Create: `client/src/workspace/WorkspaceWidgetFrame.test.tsx`

**Interfaces:**

```ts
export type WorkspaceWidgetRendererProps = { widget: WorkspaceWidgetInstance };
export function getWorkspaceWidgetRenderer(type: WorkspaceWidgetType): React.ComponentType<WorkspaceWidgetRendererProps> | null;
```

`WorkspaceWidgetFrame` accepts title + state (`ready | loading | empty | unavailable | forbidden | error`) and sanitizes error presentation.

- [ ] **Step 1: Write RED tests for known/unknown renderer resolution and local error fallback**
- [ ] **Step 2: Run focused tests**
- [ ] **Step 3: Implement renderer registry with local components only**
- [ ] **Step 4: Implement frame states without stack trace rendering**
- [ ] **Step 5: Run GREEN**
- [ ] **Step 6: Commit**

`git commit -m "feat: add isolated workspace widget renderers"`

---

### Task 4: Add per-surface operational context

**Files:**
- Create: `client/src/workspace/context/WorkspaceSurfaceContext.tsx`
- Create: `client/src/workspace/context/WorkspaceSurfaceContext.test.tsx`
- Modify: `client/src/workspace/WorkspaceScreenCanvas.tsx`

**Interfaces:**

```ts
type WorkspaceSurfaceSelection = { incidentId?: number };
useWorkspaceSurfaceContext(): {
  selection: WorkspaceSurfaceSelection;
  selectIncident(id: number | undefined): void;
};
```

No `tenantId` or `userId` in this context.

- [ ] **Step 1: RED: selecting incident updates sibling consumer within same surface**
- [ ] **Step 2: RED: separate providers do not leak selection between surfaces**
- [ ] **Step 3: Implement provider around each `WorkspaceScreenCanvas` surface**
- [ ] **Step 4: GREEN focused tests**
- [ ] **Step 5: Commit**

`git commit -m "feat: add per-surface workspace context"`

---

### Task 5: Implement read-only operational widgets

**Files:**
- Create paired components/tests for `KanbanWidget`, `IncidentDetailWidget`, `ResourcesWidget`, `SlaAlertsWidget`, `OperationalTimelineWidget`.

**Interfaces / data reuse:**
- Kanban uses existing incident listing data and calls `selectIncident(id)` on interaction.
- Incident detail reads selected `incidentId`; data retrieval must stay through authorized tRPC incident procedure.
- Resources reuses team/vehicle read endpoints; no status mutation in this task.
- SLA alerts derive/display authorized incident/SLA data; if exact read model is absent, add a read-only tRPC query in `server/routers.ts` guarded by `occurrences.view`.
- Timeline reuses `getIncidentTimeline`-backed procedure for selected incident.

- [ ] **Step 1: For each widget, write one RED test for authorized data rendering and one safe empty/no-selection case**
- [ ] **Step 2: Run each test immediately to prove RED**
- [ ] **Step 3: Implement minimal renderer using existing tRPC queries**
- [ ] **Step 4: Run the paired test to GREEN before starting the next widget**
- [ ] **Step 5: Run all five widget tests together**
- [ ] **Step 6: Commit**

`git commit -m "feat: add operational read widgets to workspace"`

---

### Task 6: Implement NEO and authorized iframe widgets without widening trust

**Files:**
- Create: `client/src/workspace/widgets/NeoCommunicationWidget.tsx`
- Create: `client/src/workspace/widgets/NeoCommunicationWidget.test.tsx`
- Create: `client/src/workspace/widgets/AuthorizedIframeWidget.tsx`
- Create: `client/src/workspace/widgets/AuthorizedIframeWidget.test.tsx`
- Reuse: `client/src/components/EmbeddedApplicationFrame.tsx`
- Reuse: `shared/embeddedApplications.ts`

**Interfaces:**
- Settings store only `applicationId`.
- Lookup comes from server-authorized embedded applications or the shared closed allowlist; never render `settings.src`.

- [ ] **Step 1: RED: arbitrary URL in settings is rejected/not rendered**
- [ ] **Step 2: RED: `neo-interact` resolves to existing NEO application only**
- [ ] **Step 3: RED: unknown applicationId renders safe unavailable state**
- [ ] **Step 4: Implement using `EmbeddedApplicationFrame` and existing `integrations.embeddedApplications.list` authorization**
- [ ] **Step 5: Run focused GREEN plus existing `EmbeddedApplicationFrame.test.tsx`**
- [ ] **Step 6: Commit**

`git commit -m "feat: add allowlisted embedded workspace widgets"`

---

### Task 7: Implement dynamic form and configurable dashboard widgets

**Files:**
- Create paired components/tests for `DynamicFormWidget` and `ConfigurableDashboardWidget`.
- Reuse D-008 forms contracts/components where they already expose published-form rendering.
- Reuse dashboard summary/read models already exposed by `server/routers.ts`.

**Interfaces:**
- `DynamicFormWidget` accepts only a published `formId` from normalized settings and selected incident context.
- `ConfigurableDashboardWidget` accepts a bounded `metricKeys` allowlist; unknown metric keys are removed, not executed.

- [ ] **Step 1: RED form test: missing/unauthorized form does not leak details**
- [ ] **Step 2: GREEN form implementation using existing D-008 authorization**
- [ ] **Step 3: RED dashboard test: unknown metric key is ignored**
- [ ] **Step 4: GREEN dashboard implementation**
- [ ] **Step 5: Run both test files plus relevant D-008/dashboard regression tests**
- [ ] **Step 6: Commit**

`git commit -m "feat: add forms and dashboard workspace widgets"`

---

### Task 8: Wire functional renderers into the screen canvas and verify multi-monitor behavior

**Files:**
- Modify: `client/src/workspace/WorkspaceScreenCanvas.tsx`
- Create/modify: `client/src/workspace/WorkspaceScreenCanvas.test.tsx`
- Modify regression tests only if behavior intentionally changes: `client/src/pages/WorkspaceExternalScreenPage.test.tsx`, `client/src/workspace/WorkspaceCanvas.test.tsx`.

- [ ] **Step 1: RED: canvas renders actual renderer content instead of title-only placeholder**
- [ ] **Step 2: RED: one renderer failure leaves sibling widget visible**
- [ ] **Step 3: RED: same D-010C widget works in an external surface fixture**
- [ ] **Step 4: Implement renderer mounting through registry + frame**
- [ ] **Step 5: Run GREEN focused tests**
- [ ] **Step 6: Run D-010B multi-monitor tests**

Commands:

```bash
pnpm vitest run --config vitest.config.ts client/src/workspace/WorkspaceScreenCanvas.test.tsx
pnpm vitest run --config vitest.config.ts client/src/workspace/multimonitor
pnpm vitest run --config vitest.config.ts client/src/pages/WorkspaceExternalScreenPage.test.tsx client/src/workspace/WorkspaceCanvas.test.tsx
```

- [ ] **Step 7: Commit**

`git commit -m "feat: render D-010C widgets across workspace surfaces"`

---

### Task 9: Security, full regression, documentation and checkpoint candidate

**Files:**
- Modify: `CHANGELOG.md`
- Create: `docs/releases/d010c-verification.md`
- Do not edit migrations unless a prior task proved a new persistence requirement.

- [ ] **Step 1: Run security gate**

`pnpm security:check`

- [ ] **Step 2: Run TypeScript**

`pnpm check`

- [ ] **Step 3: Run full unit suite**

`pnpm test`

- [ ] **Step 4: Run build**

`pnpm build`

- [ ] **Step 5: Run visual/compatibility gates available locally/CI**

```bash
pnpm test:gis-visual
pnpm test:neo-visual
```

Also require GitHub workflows equivalent to Qualidade, GIS visual homologation, NEO external compatibility and NEO workspace visual homologation to be GREEN on the final candidate SHA.

- [ ] **Step 6: Document exact counts, SHA and gate results in `docs/releases/d010c-verification.md`**
- [ ] **Step 7: Update `CHANGELOG.md` with D-010C scope and explicit non-actions: no deploy, no real migration, no grants**
- [ ] **Step 8: Commit documentation only after functional candidate is GREEN**

`git commit -m "docs: record D-010C verification"`

- [ ] **Step 9: Re-run final gates on the documentation SHA**
- [ ] **Step 10: Create checkpoint only after final GREEN**

Suggested ref: `checkpoint/d010c-widget-catalog-green-20260906`.

- [ ] **Step 11: Open PR as Draft while checks run; promote to Ready for Review only after final GREEN**
- [ ] **Step 12: Do not merge to `main` without explicit project-owner authorization**

---

## Self-review against spec

- Nine widgets: Tasks 1, 2, 5, 6, 7.
- Closed catalog: Tasks 1–3.
- Renderer isolation and safe error states: Tasks 3 and 8.
- Per-surface context with no tenant/user authority: Task 4.
- NEO/iframe allowlist: Task 6.
- Typed settings: Task 1.
- Existing D-010B layouts and N monitors: Tasks 1 and 8.
- TDD RED → GREEN: every functional task.
- Final security/quality/visual gates: Task 9.
- No automatic deploy/migration/grants: Global Constraints + Task 9.

No placeholder implementation steps are intentionally left in this plan; any discovered need for new persistence is a separate explicit gate, not an implicit scope expansion.
