import {describe, expect, it} from "vitest";
import fs from "node:fs";
import path from "node:path";
import {normalizeIncidentStageSummary} from "./incidentStageSummary";
const read = (name: string) => fs.readFileSync(path.resolve(import.meta.dirname, name), "utf8");
describe("AXED-F012 — gargalo global e escopo autorizado", () => {
  it("normaliza valores SQL e ausência de histórico sem inventar médias", () => {
    expect(normalizeIncidentStageSummary({total:"70",observed:"65",averageMinutes:"91"})).toEqual({total:70,observed:65,averageMinutes:91});
    expect(normalizeIncidentStageSummary({total:3,observed:0,averageMinutes:null})).toEqual({total:3,observed:0,averageMinutes:null});
    expect(() => normalizeIncidentStageSummary({total:2,observed:3,averageMinutes:50})).toThrow();
    expect(() => normalizeIncidentStageSummary({total:2,observed:0,averageMinutes:50})).toThrow();
  });
  it("só consulta após filtros e independente da página, em ambos os serviços", () => {
    for (const file of ["dbLegacy.ts","tenantOperational.ts"]) {
      const code=read(file);
      const start=code.indexOf(file === "dbLegacy.ts" ? "export async function listIncidents(" : "export async function listIncidentsForTenant(");
      const end=code.indexOf(file === "dbLegacy.ts" ? "export async function getIncidentById(" : "export async function getIncidentForTenant(");
      const list=code.slice(start,end);
      expect(list).toContain("input.status ? fetchIncidentStageSummary(db, where");
      expect(list).toContain(".limit(input.pageSize)");
      expect(list).toContain("return { rows: await withIncidentStageEntry(db, rows), total:");
      expect(list).toContain("stageSummary");
    }
  });
  it("restringe agregado por tenant no SQL e reutiliza entrada auditada da F011/F015", () => {
    const source=read("incidentStageSummary.ts");
    expect(source).toContain(".innerJoin(incidentTenantScopes");
    expect(source).toContain("eq(incidentTenantScopes.organizationId, tenantId)");
    expect(source).toContain("COUNT(${auditedStageEntry})");
    expect(source).toContain("TIMESTAMPDIFF");
    const ordering=read("incidentListOrder.ts");
    expect(ordering).toContain("STAGE_ENTRY_EVENTS.map");
  });
  it("diferencia cobertura da coluna inteira de página parcial e preserva os desconhecidos", () => {
    const kanban=fs.readFileSync(path.resolve(import.meta.dirname, "../client/src/pages/KanbanPage.tsx"), "utf8");
    expect(kanban).toContain("list.data?.stageSummary");
    expect(kanban).toContain("Gargalo da coluna:");
    expect(kanban).toContain("Cobertura da etapa:");
    expect(kanban).not.toContain("Gargalo na amostra:");
  });
});
