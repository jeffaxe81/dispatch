import { describe, expect, it } from "vitest";

const loadBoundaryDoc = () => import("../docs/architecture/d012-workflow-boundary.md?raw");

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
    ]) {
      expect(doc).toContain(required);
    }
  });
});
