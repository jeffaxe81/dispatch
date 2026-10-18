import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { createWorkflowSlaManualCandidateMySql } from "./workflowSlaManualCandidateMySql";

type Database = Parameters<typeof createWorkflowSlaManualCandidateMySql>[0];
const now = "2026-10-18T10:00:00.000Z";

function fakeDb() {
  let whereClause: SQL | null = null;
  const joins: SQL[] = [];
  const chain = {
    innerJoin(_table: unknown, on: SQL) {
      joins.push(on);
      return chain;
    },
    where(predicate: SQL) {
      whereClause = predicate;
      return chain;
    },
    orderBy(..._orderBy: SQL[]) { return chain; },
    async limit(_limit: number) { return [{ intentId: 41 }, { intentId: 42 }]; },
  };
  const db = {
    select: (_shape: unknown) => ({ from: (_table: unknown) => chain }),
  } as unknown as Database;
  return {
    source: createWorkflowSlaManualCandidateMySql(db),
    inspection() {
      if (!whereClause) throw new Error("WHERE ausente.");
      return {
        where: new MySqlDialect().sqlToQuery(whereClause),
        joins: joins.map(join => new MySqlDialect().sqlToQuery(join)),
      };
    },
  };
}

describe("D-012I I5C — seleção MySQL de intents vencidas", () => {
  it("consulta só intents do tenant, tarefas ativas, versão/nó congelados e prazo vencido", async () => {
    const { source, inspection } = fakeDb();
    expect(await source.listDueIntentIds({
      organizationId: 9, now, limit: 2,
    })).toEqual([41, 42]);
    const { where, joins } = inspection();
    expect(joins).toHaveLength(2);
    expect(joins.map(join => join.sql).join(" ")).toContain("execution_id");
    for (const col of [
      "organization_id", "status", "scheduled_at", "next_attempt_at_ms",
      "lease_expires_at_ms", "workflow_version_id", "node_id",
    ]) {
      expect(where.sql).toContain(col);
    }
    expect(where.params.filter(param => param === 9)).toHaveLength(2);
    expect(where.params).toContain(Date.parse(now));
    expect(where.sql).toContain("pending");
    expect(where.sql).toContain("leased");
    expect(where.sql).toContain("open");
    expect(where.sql).toContain("in_progress");
    expect(where.sql).not.toContain("delivered");
    expect(where.sql).not.toContain("dead_letter");
  });

  it("bloqueia tenant inválido, limite acima de 20 e datas UTC impossíveis", async () => {
    const { source } = fakeDb();
    await expect(source.listDueIntentIds({ organizationId: 0, now, limit: 1 }))
      .rejects.toThrow(/Parâmetros/);
    await expect(source.listDueIntentIds({ organizationId: 9, now, limit: 100 }))
      .rejects.toThrow(/Parâmetros/);
    await expect(source.listDueIntentIds({
      organizationId: 9, now: "2026-02-30T10:00:00.000Z", limit: 1,
    })).rejects.toThrow(/Parâmetros/);
  });

  it("não disponibiliza endpoint de envio nem operações de atualização do domínio", async () => {
    const { default: source } =
      await import("./workflowSlaManualCandidateMySql.ts?raw");
    expect(source).toContain("innerJoin(workflowTasks");
    expect(source).toContain("workflowExecutionTenantScopes");
    expect(source).toContain("inArray(workflowTasks.status");
    expect(source).not.toContain("update(incidents)");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("setInterval");
  });
});
