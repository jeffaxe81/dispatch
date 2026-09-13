import { describe, expect, it } from "vitest";

const loadFacade = () => import("./db.ts?raw");
const loadInstancePersistence = () => import("./workflow/workflowInstancePersistence.ts?raw");
const loadInstanceStateMachine = () => import("./workflow/workflowInstanceStateMachine.ts?raw");
const loadInstanceSchema = () => import("./workflow/workflowInstanceSchema.ts?raw");
const loadLegacyExecution = () => import("./workflow/workflowExecutionPersistence.ts?raw");
const loadMigration = () => import("../drizzle/0010_d012c_workflow_instance_state.sql?raw");

describe("D-012C workflow instance architecture", () => {
  it("reutiliza workflow_executions e não cria um segundo engine/tabela concorrente", async () => {
    const [{ default: schema }, { default: migration }] = await Promise.all([
      loadInstanceSchema(),
      loadMigration(),
    ]);

    expect(schema).toContain('"workflow_executions",');
    expect(schema).not.toContain('mysqlTable("workflow_instances"');
    expect(migration).toContain("ALTER TABLE `workflow_executions`");
    expect(migration).not.toContain("CREATE TABLE `workflow_instances`");
    expect(migration).not.toContain("DROP TABLE");
  });

  it("mantém domínio e persistência D-012C sem efeitos externos ou acoplamento a ocorrências", async () => {
    const [{ default: persistence }, { default: stateMachine }] = await Promise.all([
      loadInstancePersistence(),
      loadInstanceStateMachine(),
    ]);

    for (const source of [persistence, stateMachine]) {
      for (const forbidden of ["fetch(", "axios", "node:http", "node:https", "node:child_process", "exec(", "spawn("]) {
        expect(source).not.toContain(forbidden);
      }
    }

    expect(persistence).not.toContain("incidents");
    expect(stateMachine).not.toContain("drizzle-orm");
    expect(stateMachine).not.toContain("../db");
    expect(stateMachine).not.toContain("process.env");
  });

  it("resolve transições pela workflowVersionId congelada, sem consultar currentVersion", async () => {
    const { default: persistence } = await loadInstancePersistence();

    expect(persistence).toContain("execution.workflowVersionId");
    expect(persistence).toContain("eq(workflowVersions.id, execution.workflowVersionId)");
    expect(persistence).not.toContain("workflow.currentVersion");
  });

  it("preserva o executor legado como simulação local sem entrega externa", async () => {
    const { default: legacyExecution } = await loadLegacyExecution();

    expect(legacyExecution).toContain('mode: "simulacao"');
    expect(legacyExecution).toContain("externalRequests: 0");
    for (const forbidden of ["fetch(", "axios", "node:child_process", "exec(", "spawn("]) {
      expect(legacyExecution).not.toContain(forbidden);
    }
  });

  it("expõe somente as operações manuais D-012C pela fachada existente", async () => {
    const { default: facade } = await loadFacade();

    expect(facade).toContain("startManualWorkflowInstance");
    expect(facade).toContain("advanceManualWorkflowInstance");
    expect(facade).toContain("cancelManualWorkflowInstance");
  });
});
