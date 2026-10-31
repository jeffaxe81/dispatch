import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withIncidentStageEntry } from "./incidentStageMetrics";

function fakeDb(records: Array<{ incidentId: number; nextStatus: string | null; enteredAt: Date | null }>) {
  const q = vi.fn();
  const groupBy = vi.fn(async () => records);
  const where = vi.fn(() => ({ groupBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select } as never, q: { select, from, where, groupBy, q } };
}

describe("AXED-F011 — estágio de ocorrência é derivado de histórico auditado", () => {
  it("não consulta o banco sem linhas previamente autorizadas", async () => {
    const fake = fakeDb([]);
    expect(await withIncidentStageEntry(fake.db, [])).toEqual([]);
    expect(fake.q.select).not.toHaveBeenCalled();
  });
  it("anexa entrada da etapa apenas quando status atual corresponde ao evento", async () => {
    const enteredAt = new Date("2026-10-31T15:00:00Z");
    const fake = fakeDb([
      { incidentId: 11, nextStatus: "em_atendimento", enteredAt },
      { incidentId: 12, nextStatus: "despachada", enteredAt },
      { incidentId: 13, nextStatus: null, enteredAt },
    ]);
    const input = [
      { incident: { id: 11, status: "em_atendimento" }, teamCode: "T1" },
      { incident: { id: 12, status: "aceita" }, teamCode: "T2" },
      { incident: { id: 13, status: "triagem" }, teamCode: null },
    ];
    const output = await withIncidentStageEntry(fake.db, input);
    expect(output).toEqual([
      { ...input[0], stageEnteredAt: enteredAt },
      { ...input[1], stageEnteredAt: null },
      { ...input[2], stageEnteredAt: null },
    ]);
    expect(input).not.toHaveProperty("stageEnteredAt");
    expect(fake.q.select).toHaveBeenCalledOnce();
  });
  it("não converte evento com data inválida em horário de etapa", async () => {
    const fake = fakeDb([{ incidentId: 22, nextStatus: "triagem", enteredAt: new Date("invalid") }]);
    const output = await withIncidentStageEntry(fake.db, [{ incident: { id: 22, status: "triagem" } }]);
    expect(output[0].stageEnteredAt).toBeNull();
  });
  it("mantém a consulta restrita à página filtrada por tenant e status", () => {
    const stage = fs.readFileSync(path.resolve(import.meta.dirname, "incidentStageMetrics.ts"), "utf8");
    const tenant = fs.readFileSync(path.resolve(import.meta.dirname, "tenantOperational.ts"), "utf8");
    const legacy = fs.readFileSync(path.resolve(import.meta.dirname, "dbLegacy.ts"), "utf8");
    expect(stage).toContain("inArray(incidentEvents.incidentId, ids)");
    expect(stage).toContain("groupBy(incidentEvents.incidentId, incidentEvents.nextStatus)");
    expect(stage).toContain("STAGE_ENTRY_EVENTS");
    expect(stage).not.toContain("stageEnteredAt: row.incident.createdAt");
    const narrowed = tenant.slice(tenant.indexOf("export async function listIncidentsForTenant"), tenant.indexOf("export async function getIncidentForTenant"));
    expect(narrowed).toContain("eq(incidentTenantScopes.organizationId, tenantId)");
    expect(narrowed.indexOf(".limit(input.pageSize)")).toBeLessThan(narrowed.indexOf("withIncidentStageEntry(db, rows)"));
    expect(legacy.slice(legacy.indexOf("export async function listIncidents("), legacy.indexOf("export async function getIncidentById("))).toContain("withIncidentStageEntry(db, rows)");
  });
});
