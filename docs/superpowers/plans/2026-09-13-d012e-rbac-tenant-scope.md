# D-012E RBAC and Tenant Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalize tenant isolation and RBAC enforcement for workflows, executions, and human tasks while keeping authorization local and preparing an idempotent provenance boundary for a future central RBAC source.

**Architecture:** Reuse the existing dynamic RBAC (`access_roles`, `access_permissions`, `role_permissions`, `user_role_assignments`) and the existing active-tenant boundary. Add dedicated `workflow_tenant_scopes` and `workflow_execution_tenant_scopes` side tables so workflow ownership is explicit and execution ownership is frozen at birth; tasks inherit tenant through their execution. Add a separate provenance side table for externally-managed role assignments plus a provider-neutral contract, without implementing any external protocol or synchronization job.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM/MySQL, tRPC authorization helpers, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-d012e-rbac-tenant-scope-design.md`

## Global Constraints

- Reuse existing RBAC; do not create a second role/permission engine.
- Tenant headers select only among already-authorized organizations and never grant access by themselves.
- Workflows belong to exactly one organization in D-012E; no global/shared workflow in this cut.
- Execution tenant is frozen at creation and never recalculated from the workflow parent.
- Tasks inherit tenant only through the execution; do not duplicate `organization_id` on `workflow_tasks`.
- Legacy records with ambiguous tenant remain unscoped and fail closed.
- Central RBAC integration is not implemented; only provider-neutral provenance/contracts are added.
- External protocols/providers such as SCIM, OIDC, LDAP, REST, polling, and webhooks are out of scope.
- Migration is additive; no destructive changes to workflow core tables.
- Merge to `main` always requires a separate explicit approval.

---

### Task 1: RBAC workflow permission contract

**Files:**
- Modify: `server/accessControl.ts`
- Modify: `server/accessControl.test.ts`
- Create: `server/workflow/workflowAccessPolicy.ts`
- Create: `server/workflow/workflowAccessPolicy.test.ts`

**Interfaces:**
- Consumes: `assertPermission(user, permission)` and `AccessAssignment` from `server/accessControl.ts`.
- Produces: `WORKFLOW_PERMISSIONS`, `assertWorkflowPermission(user, action)`, and `isUserAuthorizedForOrganization(assignments, organizationId)`.

- [ ] **Step 1: Write failing tests for the permission catalog and organization-scope decision**

```ts
expect(WORKFLOW_PERMISSIONS).toEqual({
  view: "workflows.view",
  edit: "workflows.edit",
  publish: "workflows.publish",
  execute: "workflows.execute",
  taskView: "workflow_tasks.view",
  taskAssign: "workflow_tasks.assign",
  taskAct: "workflow_tasks.act",
});

expect(isUserAuthorizedForOrganization([
  { roleCode: "gestor", defaultScope: "organizacao", organizationId: 10, organizationalUnitId: null, teamId: null },
], 10)).toBe(true);
expect(isUserAuthorizedForOrganization([], 10)).toBe(false);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run server/workflow/workflowAccessPolicy.test.ts server/accessControl.test.ts`

Expected: FAIL because `WORKFLOW_PERMISSIONS` / organization authorization helper do not exist yet.

- [ ] **Step 3: Implement the minimal permission wrapper**

```ts
export const WORKFLOW_PERMISSIONS = {
  view: "workflows.view",
  edit: "workflows.edit",
  publish: "workflows.publish",
  execute: "workflows.execute",
  taskView: "workflow_tasks.view",
  taskAssign: "workflow_tasks.assign",
  taskAct: "workflow_tasks.act",
} as const;

export function isUserAuthorizedForOrganization(assignments: AccessAssignment[], organizationId: number) {
  return assignments.some(a => a.defaultScope === "global" || a.organizationId === organizationId);
}
```

`assertWorkflowPermission` delegates to the existing `assertPermission`; it must not inspect role names.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm vitest run server/workflow/workflowAccessPolicy.test.ts server/accessControl.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/accessControl.ts server/accessControl.test.ts server/workflow/workflowAccessPolicy.ts server/workflow/workflowAccessPolicy.test.ts
git commit -m "feat(d012e): define workflow RBAC policy"
```

---

### Task 2: Tenant scope persistence and deterministic backfill

**Files:**
- Create: `server/workflow/workflowTenantScopeSchema.ts`
- Create: `server/workflow/workflowTenantScopeSchema.test.ts`
- Create: `drizzle/0012_d012e_workflow_tenant_rbac.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `drizzle.config.ts`

**Interfaces:**
- Produces: `workflowTenantScopes`, `workflowExecutionTenantScopes`.
- `workflowTenantScopes.workflowId` is unique and references `workflows.id`.
- `workflowExecutionTenantScopes.executionId` is unique and references `workflow_executions.id`.

- [ ] **Step 1: Write failing schema/migration contract tests**

```ts
expect(schema).toContain("workflowTenantScopes");
expect(schema).toContain("workflowExecutionTenantScopes");
expect(migration).toContain("CREATE TABLE `workflow_tenant_scopes`");
expect(migration).toContain("CREATE TABLE `workflow_execution_tenant_scopes`");
expect(migration).toMatch(/HAVING\s+COUNT\s*\(\s*DISTINCT\s+.*organization_id/i);
expect(migration).not.toMatch(/COALESCE\s*\([^)]*organization_id[^)]*,\s*1\s*\)/i);
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm vitest run server/workflow/workflowTenantScopeSchema.test.ts`
Expected: FAIL because schema/migration do not exist.

- [ ] **Step 3: Add dedicated schemas and additive migration**

Migration backfill rule:

```sql
INSERT INTO `workflow_tenant_scopes` (`workflow_id`, `organization_id`)
SELECT w.id, MIN(ura.organization_id)
FROM `workflows` w
JOIN `user_role_assignments` ura
  ON ura.user_id = w.created_by_user_id
 AND ura.active = 1
 AND ura.organization_id IS NOT NULL
GROUP BY w.id
HAVING COUNT(DISTINCT ura.organization_id) = 1;

INSERT INTO `workflow_execution_tenant_scopes` (`execution_id`, `organization_id`)
SELECT e.id, s.organization_id
FROM `workflow_executions` e
JOIN `workflow_tenant_scopes` s ON s.workflow_id = e.workflow_id;
```

Records that do not satisfy the unique-organization rule remain unscoped.

- [ ] **Step 4: Register schema in Drizzle and migration in journal; run focused test GREEN**

Run: `pnpm vitest run server/workflow/workflowTenantScopeSchema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/workflow/workflowTenantScopeSchema.ts server/workflow/workflowTenantScopeSchema.test.ts drizzle/0012_d012e_workflow_tenant_rbac.sql drizzle/meta/_journal.json drizzle.config.ts
git commit -m "feat(d012e): add workflow tenant scope persistence"
```

---

### Task 3: Tenant-aware workflow definition operations

**Files:**
- Create: `server/workflow/workflowTenantAccess.ts`
- Create: `server/workflow/workflowTenantAccess.test.ts`
- Modify: `server/workflow/workflowPersistence.ts`
- Modify: `server/db.ts`

**Interfaces:**
- Produces: `getWorkflowTenant(tx, workflowId)`, `assertWorkflowTenant(tx, workflowId, organizationId)`, `createWorkflowTenantScope(tx, workflowId, organizationId)`.
- Tenant-aware public mutations accept `organizationId` and fail if the resource is unscoped or belongs elsewhere.

- [ ] **Step 1: Write failing tests for same-tenant, cross-tenant, and unscoped workflow behavior**

```ts
await expect(assertWorkflowTenant(tx, 5, 10)).resolves.toBeDefined();
await expect(assertWorkflowTenant(tx, 5, 11)).rejects.toThrow(/outra organização|tenant/i);
await expect(assertWorkflowTenant(tx, 6, 10)).rejects.toThrow(/sem escopo|tenant/i);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run server/workflow/workflowTenantAccess.test.ts`
Expected: FAIL because tenant helpers do not exist.

- [ ] **Step 3: Implement tenant helpers and thread `organizationId` through workflow activation/publication mutation**

`setSimulatedWorkflowActive` becomes:

```ts
setSimulatedWorkflowActive({
  workflowId,
  organizationId,
  active,
  actorUserId,
})
```

Before reading publication/version state, call `assertWorkflowTenant(tx, workflowId, organizationId)`.

- [ ] **Step 4: Verify focused tests GREEN and existing workflow tests remain GREEN**

Run: `pnpm vitest run server/workflow/workflowTenantAccess.test.ts server/workflow/workflowBoundary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/workflow/workflowTenantAccess.ts server/workflow/workflowTenantAccess.test.ts server/workflow/workflowPersistence.ts server/db.ts
git commit -m "feat(d012e): enforce tenant on workflow definitions"
```

---

### Task 4: Freeze execution tenant and protect instance transitions

**Files:**
- Modify: `server/workflow/workflowInstancePersistence.ts`
- Modify: `server/workflow/workflowInstanceTransactions.test.ts`
- Create: `server/workflow/workflowExecutionTenantPolicy.test.ts`

**Interfaces:**
- `startManualWorkflowInstance` accepts `organizationId` and writes `workflow_execution_tenant_scopes` in the same DB transaction as the execution.
- `advanceManualWorkflowInstance`, `resumeManualWorkflowInstanceFromCompletedTask`, and `cancelManualWorkflowInstance` accept `organizationId` and validate the frozen execution scope before state transition.

- [ ] **Step 1: Write failing transaction tests**

```ts
expect(insertedExecutionTenantScope).toMatchObject({ executionId, organizationId: 10 });
await expect(advanceManualWorkflowInstance({ executionId, organizationId: 11, targetNodeId: "n2", actorUserId: 7, correlationId: "c" }))
  .rejects.toThrow(/outra organização|tenant/i);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run server/workflow/workflowInstanceTransactions.test.ts server/workflow/workflowExecutionTenantPolicy.test.ts`
Expected: FAIL because execution scope is not frozen/validated yet.

- [ ] **Step 3: Implement frozen tenant insert and fail-closed transition lookup**

`loadFrozenInstanceForTransition` receives `organizationId` and must join/check `workflowExecutionTenantScopes`; missing scope is an error, never a global fallback.

- [ ] **Step 4: Run focused tests GREEN**

Run: `pnpm vitest run server/workflow/workflowInstanceTransactions.test.ts server/workflow/workflowExecutionTenantPolicy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/workflow/workflowInstancePersistence.ts server/workflow/workflowInstanceTransactions.test.ts server/workflow/workflowExecutionTenantPolicy.test.ts
git commit -m "feat(d012e): freeze tenant on workflow executions"
```

---

### Task 5: Tenant-safe human tasks and assignee validation

**Files:**
- Modify: `server/workflow/workflowTaskPersistence.ts`
- Create: `server/workflow/workflowTaskTenantPolicy.ts`
- Create: `server/workflow/workflowTaskTenantPolicy.test.ts`
- Modify: `server/workflow/workflowTaskArchitecture.test.ts`
- Modify: `server/db.ts`

**Interfaces:**
- `assertTaskTenant(tx, taskId, organizationId)` resolves task -> execution -> frozen execution tenant.
- `assertAssigneeAuthorizedForTenant(userId, organizationId)` uses current RBAC assignments/authorized-tenant rules, not role names.
- Public task mutations accept `organizationId`.

- [ ] **Step 1: Write failing tests for cross-tenant task access and assignee rejection**

```ts
await expect(assertTaskTenant(tx, 100, 20)).rejects.toThrow(/tenant|organização/i);
await expect(assertAssigneeAuthorizedForTenant(42, 10)).rejects.toThrow(/não.*autorizad/i);
```

- [ ] **Step 2: Run focused tests RED**

Run: `pnpm vitest run server/workflow/workflowTaskTenantPolicy.test.ts server/workflow/workflowTaskArchitecture.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement tenant guard for assign/claim/start/complete**

Each mutation follows:

```ts
await assertTaskTenant(tx, input.taskId, input.organizationId);
// assign only:
await assertAssigneeAuthorizedForTenant(input.assigneeUserId, input.organizationId);
```

Task state machine remains unchanged; tenant is an authorization boundary outside the pure state machine.

- [ ] **Step 4: Run focused tests GREEN**

Run: `pnpm vitest run server/workflow/workflowTaskTenantPolicy.test.ts server/workflow/workflowTaskArchitecture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/workflow/workflowTaskPersistence.ts server/workflow/workflowTaskTenantPolicy.ts server/workflow/workflowTaskTenantPolicy.test.ts server/workflow/workflowTaskArchitecture.test.ts server/db.ts
git commit -m "feat(d012e): isolate workflow tasks by tenant"
```

---

### Task 6: Provider-neutral provenance for future central RBAC

**Files:**
- Create: `server/rbac/rbacAssignmentSourceSchema.ts`
- Create: `server/rbac/centralRbacContract.ts`
- Create: `server/rbac/centralRbacContract.test.ts`
- Modify: `drizzle.config.ts`
- Extend: `drizzle/0012_d012e_workflow_tenant_rbac.sql`
- Extend: `server/workflow/workflowTenantScopeSchema.test.ts`

**Interfaces:**
- Produces `rbacAssignmentSources` side table with one optional external-management record per `user_role_assignments.id`.
- Produces provider-neutral types:

```ts
export type CentralRbacAssignmentRecord = {
  externalAssignmentId: string;
  externalSubjectId: string;
  organizationExternalId: string;
  roleCode?: string;
  permissionCodes?: string[];
  sourceKey: string;
  sourceRevision: string;
  expiresAt?: string | null;
  revoked: boolean;
};

export interface CentralRbacProvider {
  sourceKey: string;
  validate(records: CentralRbacAssignmentRecord[]): void;
}
```

No network method is part of this interface in D-012E.

- [ ] **Step 1: Write failing tests proving local/external provenance separation and provider-neutral contract**

```ts
expect(schema).toContain("rbacAssignmentSources");
expect(contract).toContain("CentralRbacProvider");
expect(contract).not.toMatch(/SCIM|LDAP|OIDC|axios|fetch\(/);
```

- [ ] **Step 2: Run focused tests RED**

Run: `pnpm vitest run server/rbac/centralRbacContract.test.ts server/workflow/workflowTenantScopeSchema.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add provenance side table and contract**

Side table minimum columns: `assignment_id` unique FK, `source_key`, `external_assignment_id`, `external_subject_id`, `source_revision`, `last_synchronized_at`, `revoked_at`, timestamps. Local assignments have no row in this table.

- [ ] **Step 4: Run focused tests GREEN**

Run: `pnpm vitest run server/rbac/centralRbacContract.test.ts server/workflow/workflowTenantScopeSchema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/rbac/rbacAssignmentSourceSchema.ts server/rbac/centralRbacContract.ts server/rbac/centralRbacContract.test.ts drizzle.config.ts drizzle/0012_d012e_workflow_tenant_rbac.sql server/workflow/workflowTenantScopeSchema.test.ts
git commit -m "feat(d012e): prepare central RBAC provenance boundary"
```

---

### Task 7: Architectural hardening, documentation, and release gate

**Files:**
- Create: `server/workflow/workflowTenantArchitecture.test.ts`
- Modify: `docs/superpowers/specs/2026-09-13-d012e-rbac-tenant-scope-design.md` only if implementation revealed a required clarification
- Create: `docs/architecture/d012e-workflow-rbac-tenant.md`
- Modify: PR description only after fresh verification

**Interfaces:**
- No new runtime behavior; this task protects invariants and documents the release.

- [ ] **Step 1: Add architecture tests**

Tests must prove:

```ts
expect(instancePersistence).toContain("workflowExecutionTenantScopes");
expect(taskPersistence).toContain("assertTaskTenant");
expect(taskSchema).not.toContain("organizationId");
expect(centralContract).not.toMatch(/SCIM|LDAP|OIDC|axios|fetch\(/);
```

- [ ] **Step 2: Run D-012E focused suite**

Run: `pnpm vitest run server/accessControl.test.ts server/workflow/*.test.ts server/rbac/*.test.ts`
Expected: PASS, 0 failures.

- [ ] **Step 3: Run full quality verification**

Run: `pnpm test`
Run: `pnpm check`
Run: `pnpm build`
Run the repository Docker packaging validation used by CI.
Expected: all exit 0.

- [ ] **Step 4: Open/update Draft PR and require all repository CI gates**

Expected gates: `Qualidade`, `NEO external compatibility`, `GIS visual homologation`, `NEO workspace visual homologation` all SUCCESS on the exact final HEAD.

- [ ] **Step 5: Mark PR ready for review only after fresh green evidence**

Do not merge. Report the exact PR number and final HEAD and request separate explicit merge authorization.
