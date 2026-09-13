import { describe, expect, it } from "vitest";

const loadBoundaryDoc = () => import("../docs/architecture/d012-workflow-boundary.md?raw");
const loadContractSource = () => import("../shared/workflowIntegration/v1.ts?raw");
const loadBoundarySource = () => import("./workflow/workflowBoundary.ts?raw");
const loadExecutionsPage = () => import("../client/src/pages/ExecutionsPage.tsx?raw");
const loadExecutorTest = () => import("./workflowExecutor.test.ts?raw");
const loadTransactionTest = () => import("./workflowExecutionTransactions.test.ts?raw");

describe("D-012A workflow architecture boundary", () => {
  it("documenta a fronteira antes de introduzir novos contratos", async () => {
    const { default: doc } = await loadBoundaryDoc();

    for (const required of [
      "workflow simulado legado",
      "server/db.ts",
      "SIMULAÇÃO / MOCK",
      "D-012A",
      "contrato versionado",
      "tenant",
      "correlationId",
      "idempotência",
      "fail-closed",
      "D-012B",
      "D-012C",
      "D-012E",
      "D-012F",
      "sem migration",
      "sem deploy",
      "sem grant",
      "sem chamada HTTP",
      "sem execução de processo",
      "sem alteração de estado de ocorrência",
    ]) {
      expect(doc).toContain(required);
    }
  });

  it("mantém contratos e boundary livres de persistência, rede e execução de processos", async () => {
    const [{ default: contractSource }, { default: boundarySource }] = await Promise.all([
      loadContractSource(),
      loadBoundarySource(),
    ]);
    const sources = [contractSource, boundarySource];
    const forbiddenFragments = [
      "drizzle",
      "mysql2",
      "server/db",
      "node:child_process",
      "DATABASE_URL",
      "fetch(",
      "axios",
      ".request(",
      "exec(",
      "spawn(",
    ];

    for (const source of sources) {
      for (const forbidden of forbiddenFragments) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it("preserva a superfície legada explicitamente como simulação", async () => {
    const [
      { default: executionsPage },
      { default: executorTest },
      { default: transactionTest },
    ] = await Promise.all([
      loadExecutionsPage(),
      loadExecutorTest(),
      loadTransactionTest(),
    ]);

    expect(executionsPage).toContain("SIMULAÇÃO / MOCK");
    expect(executorTest).toContain("externalRequests: 0");
    expect(transactionTest).toContain("simulationOnly: true");
  });
});
