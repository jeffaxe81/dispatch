import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { incidentListInputSchema, MAX_INCIDENT_PAGE } from "./incidentListValidation";

describe("AXED-F014: intervalo de abertura de ocorrências", () => {
  it("mantém paginação e parâmetros existentes sem exigir intervalo", () => {
    expect(incidentListInputSchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(incidentListInputSchema.parse({ page: 4, pageSize: 100, teamId: 15, priority: "alta" }))
      .toMatchObject({ page: 4, pageSize: 100, teamId: 15, priority: "alta" });
  });

  it("recebe intervalo semiaberto válido e preserva as datas", () => {
    const from = new Date("2026-10-01T00:00:00.000Z");
    const before = new Date("2026-11-01T00:00:00.000Z");
    expect(incidentListInputSchema.parse({ openedFrom: from, openedBefore: before }))
      .toMatchObject({ openedFrom: from, openedBefore: before });
  });

  it("permite filtrar somente o início ou somente o fim", () => {
    expect(incidentListInputSchema.parse({ openedFrom: new Date("2026-10-01T00:00:00Z") }).openedFrom).toBeInstanceOf(Date);
    expect(incidentListInputSchema.parse({ openedBefore: new Date("2026-11-01T00:00:00Z") }).openedBefore).toBeInstanceOf(Date);
  });

  it("impede paginação profunda ilimitada e preserva o limite permitido", () => {
    expect(incidentListInputSchema.parse({page:MAX_INCIDENT_PAGE,pageSize:100}).page)
      .toBe(MAX_INCIDENT_PAGE);
    for (const page of [MAX_INCIDENT_PAGE+1,Number.MAX_SAFE_INTEGER,Infinity,NaN,1.5]) {
      expect(()=>incidentListInputSchema.parse({page})).toThrow();
    }
  });

  it("nega intervalo invertido, vazio, data inválida e página inválida", () => {
    const from = new Date("2026-11-01T00:00:00Z");
    const before = new Date("2026-10-01T00:00:00Z");
    expect(() => incidentListInputSchema.parse({ openedFrom: from, openedBefore: before })).toThrow();
    expect(() => incidentListInputSchema.parse({ openedFrom: from, openedBefore: from })).toThrow();
    expect(() => incidentListInputSchema.parse({ openedFrom: "data inexistente" })).toThrow();
    expect(() => incidentListInputSchema.parse({ page: 0 })).toThrow();
    expect(() => incidentListInputSchema.parse({ pageSize: 101 })).toThrow();
  });
});

const read = (relative: string) => fs.readFileSync(path.resolve(import.meta.dirname, "..", relative), "utf8");

describe("AXED-F013/F014/F018: contrato de listagem tenant-aware", () => {
  it("ambos os routers exigem filtro de equipe autorizado em vez de ampliar a listagem", () => {
    for (const file of ["server/routers.ts", "server/tenantAwareAppRouter.ts"]) {
      const code = read(file);
      const incidentArea = code.slice(code.indexOf("  incidents: router({"));
      const listHandler = incidentArea.slice(0, incidentArea.indexOf("    get: operationalProcedure"));
      expect(listHandler).toContain(".input(incidentListInputSchema)");
      expect(listHandler).toContain('resolveAuthorizedTeamFilter(ctx.user, input.teamId, "occurrences.view")');
      expect(listHandler).not.toContain('ctx.user.operationalRole === "agente" ?');
    }
    const tenantRouter = read("server/tenantAwareAppRouter.ts");
    const tenantList = tenantRouter.slice(tenantRouter.indexOf("  incidents: router({"), tenantRouter.indexOf("    get: operationalProcedure", tenantRouter.indexOf("  incidents: router({")));
    expect(tenantList).toContain("await assertTeamTenant(tenantId, teamId)");
    expect(tenantList).toContain('await assertTeamScope(ctx.user, teamId, "occurrences.view", tenantId)');
    expect(tenantList).toContain("return listIncidentsForTenant(tenantId, { ...input, teamId })");
  });

  it("data de abertura é filtrada na consulta SQL, antes da contagem/paginação", () => {
    for (const [file, method] of [
      ["server/dbLegacy.ts", "export async function listIncidents("],
      ["server/tenantOperational.ts", "export async function listIncidentsForTenant("],
    ] as const) {
      const source = read(file);
      const snippet = source.slice(source.indexOf(method), source.indexOf(method) + 2400);
      expect(snippet).toContain("gte(incidents.createdAt, input.openedFrom)");
      expect(snippet).toContain("lt(incidents.createdAt, input.openedBefore)");
      expect(snippet.indexOf("gte(incidents.createdAt")).toBeLessThan(snippet.indexOf(".limit(input.pageSize)"));
      expect(snippet.indexOf("lt(incidents.createdAt")).toBeLessThan(snippet.indexOf("count()"));
    }
  });

  it("tenant read model preserva isolamento na mesma cláusula WHERE do período", () => {
    const s = read("server/tenantOperational.ts");
    const part = s.slice(s.indexOf("export async function listIncidentsForTenant("), s.indexOf("export async function getIncidentForTenant("));
    expect(part).toContain("eq(incidentTenantScopes.organizationId, tenantId)");
    expect(part).toContain("const where = and(...filters)");
    expect(part).toContain(".where(where)");
    expect(part).toContain(".limit(input.pageSize)");
    expect(part).toContain(".offset((input.page - 1) * input.pageSize)");
  });

  it("Kanban possui filtros de equipe e período e paginação navegável", () => {
    const s = read("client/src/pages/KanbanPage.tsx");
    expect(s).toContain("Filtrar equipe no Kanban");
    expect(s).toContain("Abertura desde");
    expect(s).toContain("Abertura até");
    expect(s).toContain("function KanbanColumn(");
    expect(s).toContain("setPage(value => Math.min(totalPages, value + 1))");
    expect(s).toContain("status, page, pageSize: COLUMN_PAGE_SIZE,");
    expect(s).toContain("status, page, pageSize: COLUMN_PAGE_SIZE,");
    expect(s).toContain("openedBefore,");
    expect(s).toContain("teamId: teamFilter");
  });
});
