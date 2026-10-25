import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { workflowTasks } from "./workflowTaskSchema";

const loadSchema = () => import("./workflowTaskSchema.ts?raw");
const loadDrizzleConfig = () => import("../../drizzle.config.ts?raw");

describe("D-012D workflow task schema", () => {
  it("gera SQL contra a coluna status criada pela migration 0011", async () => {
    const { default: ddl } = await import("../../drizzle/0011_d012d_workflow_tasks.sql?raw");
    expect(ddl).toContain("`status` enum('open','in_progress','completed','cancelled')");
    const query = drizzle({ client: {} as never }).select({ state: workflowTasks.status })
      .from(workflowTasks).where(eq(workflowTasks.status, "open")).toSQL();
    expect(query.sql).toContain("`workflow_tasks`.`status` = ?");
    expect(query.sql).not.toContain("`workflow_task_status`");
    expect(query.params).toEqual(["open"]);
  });

  it("define workflow_tasks em modulo proprio sem criar workflow_instances", async () => {
    const { default: source } = await loadSchema();
    expect(source).toContain("mysqlTable(");
    expect(source).toContain('"workflow_tasks",');
    expect(source).toContain("workflowTaskStatusEnum");
    expect(source).toContain("executionId");
    expect(source).toContain("workflowVersionId");
    expect(source).toContain("assigneeUserId");
    expect(source).toContain("workflow_tasks_execution_node_unique");
    expect(source).not.toContain('mysqlTable("workflow_instances"');
  });

  it("inclui o schema de tarefas no Drizzle para futuras migrations", async () => {
    const { default: config } = await loadDrizzleConfig();
    expect(config).toContain("./server/workflow/workflowTaskSchema.ts");
  });
});
