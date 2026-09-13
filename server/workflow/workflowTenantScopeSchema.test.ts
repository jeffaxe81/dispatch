import { describe, expect, it } from "vitest";

const loadSchema = () => import("./workflowTenantScopeSchema.ts?raw");
const loadMigration = () => import("../../drizzle/0012_d012e_workflow_tenant_rbac.sql?raw");
const loadConfig = () => import("../../drizzle.config.ts?raw");
const loadJournal = () => import("../../drizzle/meta/_journal.json?raw");

describe("D-012E workflow tenant scope persistence", () => {
  it("define escopos dedicados para workflow e execução sem duplicar tenant em tarefas", async () => {
    const { default: schema } = await loadSchema();
    expect(schema).toContain("workflowTenantScopes");
    expect(schema).toContain("workflowExecutionTenantScopes");
    expect(schema).toContain('\"workflow_tenant_scopes\"');
    expect(schema).toContain('\"workflow_execution_tenant_scopes\"');
  });

  it("mantém migration aditiva e faz backfill apenas quando a organização é inequívoca", async () => {
    const { default: migration } = await loadMigration();
    expect(migration).toContain("CREATE TABLE `workflow_tenant_scopes`");
    expect(migration).toContain("CREATE TABLE `workflow_execution_tenant_scopes`");
    expect(migration).toContain("CREATE TABLE `rbac_assignment_sources`");
    expect(migration).toContain("CREATE INDEX `rbac_assignment_sources_subject_idx`");
    expect(migration).toMatch(/HAVING\s+COUNT\s*\(\s*DISTINCT\s+[^)]*organization_id[^)]*\)\s*=\s*1/i);
    expect(migration).not.toMatch(/COALESCE\s*\([^)]*organization_id[^)]*,\s*1\s*\)/i);
    expect(migration).not.toMatch(/UPDATE\s+`?workflow_tasks`?/i);
  });

  it("separa todos os comandos SQL para execução segura pelo drizzle-kit migrate", async () => {
    const { default: migration } = await loadMigration();
    const statements = migration.split("--> statement-breakpoint").map(statement => statement.trim()).filter(Boolean);
    expect(statements).toHaveLength(9);
  });

  it("registra schemas e migration no controle do Drizzle", async () => {
    const [{ default: config }, { default: rawJournal }] = await Promise.all([loadConfig(), loadJournal()]);
    expect(config).toContain("./server/workflow/workflowTenantScopeSchema.ts");
    expect(config).toContain("./server/rbac/rbacAssignmentSourceSchema.ts");
    const journal = JSON.parse(rawJournal) as { entries: Array<{ idx: number; tag: string }> };
    expect(journal.entries.at(-1)).toMatchObject({ idx: 12, tag: "0012_d012e_workflow_tenant_rbac" });
  });
});
