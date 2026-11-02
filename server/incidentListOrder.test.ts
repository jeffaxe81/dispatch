import {describe, expect, it} from "vitest";
import {sql} from "drizzle-orm";
import {MySqlDialect} from "drizzle-orm/mysql-core";
import {incidentListOrder} from "./incidentListOrder";
import {incidentListInputSchema} from "./incidentListValidation";

function compiledOrder(sort: "priority" | "oldest" | "newest" | "stage-oldest" | undefined) {
  return new MySqlDialect().sqlToQuery(sql.join(incidentListOrder(sort), sql`, `));
}
describe("AXED-F015 — ordenação SQL global do Kanban", () => {
  it("aceita apenas opções conhecidas sem alterar a listagem padrão", () => {
    expect(incidentListInputSchema.parse({sortOrder:"stage-oldest"}).sortOrder).toBe("stage-oldest");
    expect(incidentListInputSchema.safeParse({sortOrder:"arbitrary"}).success).toBe(false);
    expect(incidentListInputSchema.parse({})).toMatchObject({page:1,pageSize:25});
  });
  it("ordena por entrada auditada e mantém histórico ausente por último", () => {
    const q=compiledOrder("stage-oldest");
    expect(q.sql).toMatch(/MAX\(e\.created_at\)/i);
    expect(q.sql).toMatch(/e\.incident_id/);
    expect(q.sql).toMatch(/e\.next_status/);
    expect(q.sql).toMatch(/IS NULL THEN 1 ELSE 0/);
    expect(q.params).toContain("status_changed");
    expect(q.params).toContain("dispatch_accepted");
    expect(q.params).toContain("occurrence_created");
  });
  it("suporta prioridade e tempo determinísticos em todas as páginas", () => {
    expect(compiledOrder("priority").sql).toContain("WHEN 'critica' THEN 4");
    expect(compiledOrder("oldest").sql.toLowerCase()).toContain("asc");
    expect(compiledOrder("newest").sql.toLowerCase()).toContain("desc");
    expect(compiledOrder(undefined).sql.toLowerCase()).toContain("desc");
  });
});
