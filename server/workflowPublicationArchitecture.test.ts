import { describe, expect, it } from "vitest";

const loadFacade = () => import("./db.ts?raw");
const loadPublicationPersistence = () => import("./workflow/workflowPersistence.ts?raw");
const loadExecutionPersistence = () => import("./workflow/workflowExecutionPersistence.ts?raw");
const loadPublicationSchema = () => import("./workflow/workflowPublicationSchema.ts?raw");
const loadMigration = () => import("../drizzle/0009_d012b_workflow_published_version.sql?raw");

describe("D-012B workflow publication architecture", () => {
  it("mantém publicação e execução vinculadas ao ponteiro publicado explícito", async () => {
    const [
      { default: facade },
      { default: publication },
      { default: execution },
      { default: publicationSchema },
    ] = await Promise.all([
      loadFacade(),
      loadPublicationPersistence(),
      loadExecutionPersistence(),
      loadPublicationSchema(),
    ]);

    expect(publicationSchema).toContain('publishedVersion: int("published_version")');
    expect(publication).toContain("publishedVersion = input.active ? before.currentVersion : previousPublishedVersion");
    expect(publication).toContain("publishedVersion: previousPublishedVersion");
    expect(execution).toContain("workflowPublicationPointers");
    expect(execution).toContain("pointer.publishedVersion");
    expect(execution).not.toContain("workflow.currentVersion");
    expect(execution).toContain("O workflow ativo não possui versão publicada válida.");
    expect(facade).toContain('export { setSimulatedWorkflowActive } from "./workflow/workflowPersistence"');
    expect(facade).toContain('export { executeSimulatedWorkflow, retrySimulatedWorkflowExecution } from "./workflow/workflowExecutionPersistence"');
  });

  it("mantém a migration aditiva, nullable e com backfill dos workflows já publicados", async () => {
    const { default: migration } = await loadMigration();

    expect(migration).toContain("ADD `published_version` int NULL");
    expect(migration).toContain("SET `published_version` = `current_version`");
    expect(migration).toContain("`workflow_status` = 'publicado'");
    expect(migration).not.toContain("DROP COLUMN");
    expect(migration).not.toContain("DELETE FROM");
  });

  it("preserva o executor como simulação local sem introduzir entrega externa", async () => {
    const { default: execution } = await loadExecutionPersistence();

    for (const forbidden of ["fetch(", "axios", "node:child_process", "exec(", "spawn("]) {
      expect(execution).not.toContain(forbidden);
    }
    expect(execution).toContain('mode: "simulacao"');
    expect(execution).toContain("externalRequests: 0");
  });
});
