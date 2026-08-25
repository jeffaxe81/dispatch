import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  auditLogs,
  incidentAssignments,
  incidentEvents,
  incidentEvidence,
  incidents,
  integrationConnections,
  integrationCredentials,
  integrationLogs,
  integrationOpenapiOperations,
  integrationOpenapiSpecs,
  integrationWebhooks,
  teamLocations,
  teams,
  userProfiles,
  userRoleAssignments,
  users,
  vehicles,
  workflowExecutions,
  workflowExecutionSteps,
  workflowVersions,
  workflows,
} from "../drizzle/schema";
import { resetSolutionOperationalData, setDbForTesting, SOLUTION_RESET_CONFIRMATIONS } from "./db";

function createResetHarness() {
  const counts = new Map<unknown, number>([
    [incidents, 2],
    [incidentAssignments, 3],
    [incidentEvidence, 4],
    [incidentEvents, 5],
    [teamLocations, 6],
    [workflows, 7],
    [workflowVersions, 8],
    [workflowExecutions, 9],
    [workflowExecutionSteps, 10],
    [integrationConnections, 11],
    [integrationCredentials, 12],
    [integrationWebhooks, 13],
    [integrationLogs, 14],
    [integrationOpenapiSpecs, 15],
    [integrationOpenapiOperations, 16],
    [users, 17],
    [userProfiles, 18],
    [userRoleAssignments, 19],
    [teams, 20],
    [vehicles, 21],
  ]);
  const deleted: unknown[] = [];
  const audits: Array<Record<string, unknown>> = [];
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: async () => [{ total: counts.get(table) ?? 0 }], then: (resolve: (rows: Array<{ total: number }>) => unknown) => resolve([{ total: counts.get(table) ?? 0 }]) }) }),
    delete: (table: unknown) => ({ where: async () => { deleted.push(table); }, then: (resolve: () => unknown) => { deleted.push(table); return resolve(); } }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table !== auditLogs) throw new Error("Tabela inesperada para auditoria de reinicialização.");
        audits.push(values);
      },
    }),
  };
  return { db: { transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) }, deleted, audits };
}

let originalNodeEnv: string | undefined;

beforeEach(() => { originalNodeEnv = process.env.NODE_ENV; process.env.NODE_ENV = "test"; });
afterEach(() => { setDbForTesting(null); process.env.NODE_ENV = originalNodeEnv; });

describe("transação de reinicialização controlada", () => {
  it("remove somente dados operacionais e simulados e preserva a evidência no Log de operações", async () => {
    const harness = createResetHarness();
    setDbForTesting(harness.db as never);

    const result = await resetSolutionOperationalData({ actorUserId: 88, scope: "operational", confirmation: SOLUTION_RESET_CONFIRMATIONS.operational, reason: "Preparar o ambiente para novo ciclo operacional." });

    expect(result.totalRecords).toBe(135);
    expect(harness.deleted).toEqual([integrationLogs, integrationWebhooks, integrationOpenapiSpecs, workflows, integrationConnections, integrationCredentials, teamLocations, incidents]);
    expect(harness.audits).toHaveLength(1);
    expect(harness.audits[0]).toMatchObject({ resourceType: "solution_reset", resourceId: 0, action: "operational_data_reset", actorUserId: 88, afterData: expect.objectContaining({ completed: true, clearedRecordCount: 135, auditPreserved: true }) });
    expect(harness.audits[0]?.beforeData).toMatchObject({ reason: "Preparar o ambiente para novo ciclo operacional.", totalRecords: 135, impact: { occurrences: 2, importedOpenapiOperations: 16 } });
  });

  it("não inicia transação quando a frase de confirmação não corresponde ao requisito", async () => {
    await expect(resetSolutionOperationalData({ actorUserId: 88, scope: "operational", confirmation: "ZERAR AXE", reason: "Tentativa inválida de reinicialização." })).rejects.toThrow("Confirmação inválida");
  });

  it("inclui cadastros de usuários, equipes e viaturas somente no escopo total, preservando a auditoria", async () => {
    const harness = createResetHarness();
    setDbForTesting(harness.db as never);

    const result = await resetSolutionOperationalData({ actorUserId: 88, scope: "total", confirmation: SOLUTION_RESET_CONFIRMATIONS.total, reason: "Encerrar todos os dados para nova implantação controlada." });

    expect(result.totalRecords).toBe(230);
    expect(harness.deleted).toEqual([integrationLogs, integrationWebhooks, integrationOpenapiSpecs, workflows, integrationConnections, integrationCredentials, teamLocations, incidents, userRoleAssignments, userProfiles, users, vehicles, teams]);
    expect(harness.audits[0]?.beforeData).toMatchObject({ resetScope: "total_solution_data", impact: { users: 17, userProfiles: 18, userRoleAssignments: 19, teams: 20, vehicles: 21 } });
    expect(harness.audits[0]?.afterData).toMatchObject({ auditPreserved: true, clearedRecordCount: 230 });
  });
});
