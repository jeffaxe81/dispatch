import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, workflowVersions, workflows } from "../drizzle/schema";
import { createSimulatedWorkflow, deleteSimulatedWorkflow, setDbForTesting, setSimulatedWorkflowActive, updateSimulatedWorkflow } from "./db";

function createWorkflowTransactionHarness() {
  let workflow: Record<string, unknown> | null = null;
  const versions: Record<string, unknown>[] = [];
  const auditEntries: Record<string, unknown>[] = [];
  let versionId = 0;

  const tx = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === workflows) {
          return {
            $returningId: async () => {
              workflow = { id: 1, publishedAt: null, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), ...values };
              return [{ id: 1 }];
            },
          };
        }
        if (table === workflowVersions) {
          return {
            $returningId: async () => {
              versionId += 1;
              versions.push({ id: versionId, ...values });
              return [{ id: versionId }];
            },
          };
        }
        if (table === auditLogs) {
          auditEntries.push(values);
          return Promise.resolve();
        }
        throw new Error("Tabela inesperada no teste.");
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === workflows) return workflow ? [workflow] : [];
            if (table === workflowVersions) return workflow ? versions.filter(version => version.version === workflow?.currentVersion).slice(0, 1) : [];
            return [];
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          if (table === workflows && workflow) workflow = { ...workflow, ...patch };
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        if (table === workflows) workflow = null;
      },
    }),
  };

  return {
    db: { transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) },
    auditEntries,
    versions,
  };
}

let originalNodeEnv: string | undefined;

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  setDbForTesting(null);
  process.env.NODE_ENV = originalNodeEnv;
});

describe("transações auditáveis de workflows simulados", () => {
  it("registra criação, edição, publicação, desativação e exclusão em audit_logs", async () => {
    const harness = createWorkflowTransactionHarness();
    setDbForTesting(harness.db as never);

    await createSimulatedWorkflow({ name: "Triagem simulada", description: "Versão inicial", actorUserId: 7 });
    await updateSimulatedWorkflow({ workflowId: 1, name: "Triagem revisada", description: "Versão 2", changeSummary: "Ajuste de título", definition: { nodes: [{ id: "trigger-1", type: "trigger.manual", label: "Execução manual", position: { x: 24, y: 24 }, configuration: { mode: "simulacao", inputLabel: "entrada_manual" } }], edges: [], metadata: { mode: "simulacao", definitionVersion: 1 } }, actorUserId: 7 });
    await setSimulatedWorkflowActive({ workflowId: 1, active: true, actorUserId: 7 });
    await setSimulatedWorkflowActive({ workflowId: 1, active: false, actorUserId: 7 });
    await deleteSimulatedWorkflow({ workflowId: 1, actorUserId: 7 });

    expect(harness.auditEntries.map(entry => entry.action)).toEqual(["create", "update_versioned", "publish_activate", "deactivate", "delete"]);
    expect(harness.auditEntries[0]).toMatchObject({ resourceType: "workflow", resourceId: 1, actorUserId: 7, afterData: { simulationOnly: true, version: 1 } });
    expect(harness.auditEntries[1]).toMatchObject({ beforeData: { currentVersion: 1 }, afterData: { currentVersion: 2, changeSummary: "Ajuste de título" } });
    expect(harness.versions[1]).toMatchObject({ definition: { nodes: [expect.objectContaining({ configuration: { mode: "simulacao", inputLabel: "entrada_manual" } })] } });
    expect(harness.auditEntries[4]).toMatchObject({ action: "delete", beforeData: { name: "Triagem revisada", currentVersion: 2 }, afterData: null });
  });
});
