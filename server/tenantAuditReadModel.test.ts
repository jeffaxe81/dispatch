import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveTenantAuditVisibility, isTenantIncidentAuditVisible, sanitizeIncidentAuditRows, sanitizeTenantAuditSnapshot, type TenantAuditScopeGrant } from "./tenantAuditReadModel";

const grant = (scope: TenantAuditScopeGrant["defaultScope"], organizationId: number | null, teamId: number | null = null, unitId: number | null = null): TenantAuditScopeGrant => ({
  defaultScope: scope, organizationId, organizationalUnitId: unitId, teamId,
});

describe("AXED-F091: isolamento de escopo de auditoria", () => {
  it("nega acesso a registros de outra organização, inclusive quando a concessão menciona equipe igual", () => {
    expect(deriveTenantAuditVisibility(101, [grant("equipe", 202, 77)], false)).toEqual({
      allTenant: false, teamIds: [], unitIds: [],
    });
  });

  it("respeita equipes explícitas da organização, sem ampliar a outras equipes", () => {
    expect(deriveTenantAuditVisibility(101, [grant("equipe", 101, 77), grant("equipe", 101, 77), grant("equipe", 101, 88)], false)).toEqual({
      allTenant: false, teamIds: [77, 88], unitIds: [],
    });
  });

  it("respeita unidades/departamentos autorizados no mesmo tenant", () => {
    expect(deriveTenantAuditVisibility(101, [grant("unidade", 101, null, 5), grant("departamento", 101, null, 6)], false)).toEqual({
      allTenant: false, teamIds: [], unitIds: [5, 6],
    });
  });

  it("somente concessão organizacional da organização atual permite todo o tenant", () => {
    expect(deriveTenantAuditVisibility(101, [grant("organizacao", 202)], false).allTenant).toBe(false);
    expect(deriveTenantAuditVisibility(101, [grant("organizacao", 101)], false).allTenant).toBe(true);
  });

  it("concessão global com empresa/unidade/equipe embutida não amplia auditoria", () => {
    for (const malformed of [
      grant("global", 101),
      grant("global", null, 77),
      grant("global", null, null, 44),
      grant("global", 101, 77, 44),
    ]) {
      expect(deriveTenantAuditVisibility(101, [malformed], false))
        .toEqual({ allTenant: false, teamIds: [], unitIds: [] });
      expect(deriveTenantAuditVisibility(202, [malformed], false))
        .toEqual({ allTenant: false, teamIds: [], unitIds: [] });
    }
  });

  it("concessão global válida continua limitada pelo tenant ativo na consulta", () => {
    expect(deriveTenantAuditVisibility(101, [grant("global", null)], false).allTenant).toBe(true);
    expect(deriveTenantAuditVisibility(202, [grant("global", null)], false).allTenant).toBe(true);
  });

  it("sem perfil dinâmico mantém política legada; dinâmico sem role audit.view é fail-closed", () => {
    expect(deriveTenantAuditVisibility(101, [], true).allTenant).toBe(true);
    expect(deriveTenantAuditVisibility(101, [], false)).toEqual({ allTenant: false, teamIds: [], unitIds: [] });
  });

  it("descarta equipe, unidade e tenant inválidos sem fallback global", () => {
    expect(deriveTenantAuditVisibility(101, [grant("equipe", 101, -1), grant("unidade", 101, null, -1)], false)).toEqual({
      allTenant: false, teamIds: [], unitIds: [],
    });
    expect(() => deriveTenantAuditVisibility(0, [], true)).toThrow();
  });
});

describe("P0 — incidente auditado somente dentro do escopo audit.view", () => {
  const organizationId = 101;
  const assignedTeamId = 77;
  const team = { id: 77, organizationId, organizationalUnitId: 9 };
  const denied = { allTenant: false, teamIds: [], unitIds: [] };

  it("nega acesso se papel dinâmico não traz concessão de auditoria", () => {
    expect(isTenantIncidentAuditVisible({scope:denied,organizationId,assignedTeamId,team})).toBe(false);
  });

  it("um auditor de equipe vê sua própria equipe, mas nunca outra equipe/tenant", () => {
    const scope = { allTenant: false, teamIds: [77], unitIds: [] };
    expect(isTenantIncidentAuditVisible({scope,organizationId,assignedTeamId,team})).toBe(true);
    expect(isTenantIncidentAuditVisible({scope,organizationId,assignedTeamId:88,
      team:{id:88,organizationId,organizationalUnitId:9}})).toBe(false);
    expect(isTenantIncidentAuditVisible({scope,organizationId,assignedTeamId,
      team:{...team,organizationId:202}})).toBe(false);
  });

  it("auditoria por unidade só vê equipes pertencentes à unidade autorizada", () => {
    const scope = { allTenant: false, teamIds: [], unitIds: [9] };
    expect(isTenantIncidentAuditVisible({scope,organizationId,assignedTeamId,team})).toBe(true);
    expect(isTenantIncidentAuditVisible({scope,organizationId,assignedTeamId,
      team:{...team,organizationalUnitId:10}})).toBe(false);
    expect(isTenantIncidentAuditVisible({scope,organizationId,assignedTeamId,
      team:{...team,organizationalUnitId:null}})).toBe(false);
  });

  it("ocorrência sem equipe não é revelada a auditor com escopo restrito", () => {
    const scope = { allTenant: false, teamIds: [77], unitIds: [9] };
    expect(isTenantIncidentAuditVisible({scope,organizationId,assignedTeamId:null,team:null})).toBe(false);
  });

  it("auditor de organização pode consultar ocorrências não atribuídas do próprio tenant", () => {
    const scope = { allTenant: true, teamIds: [], unitIds: [] };
    expect(isTenantIncidentAuditVisible({scope,organizationId,assignedTeamId:null,team:null})).toBe(true);
  });

  it.each([0,-1,NaN,1.5,Number.MAX_SAFE_INTEGER+1])(
    "nega id de organização inválido: %s", organizationId => {
      const scope = { allTenant: true, teamIds: [], unitIds: [] };
      expect(isTenantIncidentAuditVisible({scope,organizationId,assignedTeamId:null,team:null})).toBe(false);
    },
  );

  it("oculta identificação do ator, contatos e payloads mantendo a cronologia legível", () => {
    const entries = [{ audit: {
      id: 1, actorUserId: 17,
      action: "incident_updated", createdAt: new Date("2026-11-07T16:00:00Z"),
      beforeData: { status:"triagem", requesterName:"Dado pessoal", token:"SECRET" },
      afterData: { status:"aguardando_despacho", address:"Dado pessoal", priority:"alta" },
    }, actorName:"Pessoa identificável" }];
    const sanitized = sanitizeIncidentAuditRows(entries);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].audit.id).toBe(1);
    expect(sanitized[0].audit.actorUserId).toBeNull();
    expect(sanitized[0].actorName).toBe("Usuário auditado");
    expect(sanitized[0].audit.beforeData).toEqual({status:"triagem"});
    expect(sanitized[0].audit.afterData).toEqual({status:"aguardando_despacho",priority:"alta"});
    expect(JSON.stringify(sanitized)).not.toMatch(/SECRET|Dado pessoal|Pessoa identificável/);
    expect(entries[0].audit.actorUserId).toBe(17); // Never mutate audit source.
  });

  it("o router verifica tenant, concessão de auditoria, equipe e redige antes da leitura", () => {
    const source=fs.readFileSync(path.resolve(import.meta.dirname, "tenantAwareAppRouter.ts"),"utf8");
    const start=source.indexOf("    audit: operationalProcedure.input",source.indexOf("  incidents: router({"));
    const end=source.indexOf("    export: operationalProcedure",start);
    const handler=source.slice(start,end);
    expect(handler).toContain('await assertPermission(ctx.user, "audit.view")');
    expect(handler).toContain("const tenantId = await tenantFor(ctx)");
    expect(handler).toContain("const incident = requireIncident(await getIncidentForTenant");
    expect(handler).toContain("await assertTenantIncidentAuditAccess({");
    expect(handler).toContain("assignedTeamId: incident.assignedTeamId");
    expect(handler.indexOf("await assertTenantIncidentAuditAccess("))
      .toBeLessThan(handler.indexOf("await getIncidentAudit(input.incidentId)"));
    expect(handler).toContain("sanitizeIncidentAuditRows(await getIncidentAudit(input.incidentId))");
  });
});

describe("AXED-F091: minimização, busca, paginação e autorização no servidor", () => {
  it("redige PII, segredos, payloads e árvores JSON aninhadas", () => {
    expect(sanitizeTenantAuditSnapshot({
      code: "OCR-001", status: "em_atendimento",
      requesterName: "Nome pessoal", email: "secret@domain.test",
      password: "secret", token: "secret", address: "Rua Particular",
      metadata: { secret: "nested" }, beforeData: { private: true },
      priority: "alta", assignedTeamId: 12,
    })).toEqual({ code: "OCR-001", status: "em_atendimento", priority: "alta", assignedTeamId: 12 });
  });

  it("não projeta objetos, arrays, textos extensos ou datas sem permissão", () => {
    expect(sanitizeTenantAuditSnapshot({ status: ["ok"], code: "A".repeat(161), createdAt: "2026-10-31" })).toBeNull();
    expect(sanitizeTenantAuditSnapshot(null)).toBeNull();
    expect(sanitizeTenantAuditSnapshot([1, 2])).toBeNull();
  });

  it("consulta canonical owner sob filtro de tenant antes de LIMIT e COUNT", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "tenantAuditReadModel.ts"), "utf8");
    expect(source).toContain("eq(incidentTenantScopes.organizationId, input.organizationId)");
    expect(source).toContain("eq(vehicleTenantScopes.organizationId, input.organizationId)");
    expect(source).toContain("eq(teams.organizationId, input.organizationId)");
    expect(source).toContain("scope.allTenant ? undefined : eq(teams.organizationId, input.organizationId)");
    expect(source).toContain("actorUserId: null");
    expect(source).toContain("eq(incidentAssignments.id, auditLogs.resourceId)");
    expect(source).toContain("eq(incidentEvidence.id, auditLogs.resourceId)");
    expect(source).toContain("eq(auditLogs.resourceType, \"incident\")");
    expect(source).toContain("eq(auditLogs.resourceType, \"assignment\")");
    expect(source).toContain("eq(auditLogs.resourceType, \"incident_evidence\")");
    expect(source).toContain("const where = and(");
    expect(source).toContain("where(where)");
    expect(source).toContain(".limit(input.pageSize)");
    expect(source).toContain("db.select({ total: count() }).from(auditLogs).where(where)");
    expect(source).not.toContain("eq(auditLogs.actorUserId, input.organizationId)");
  });

  it("roteia o histórico operacional pelo tenant efetivo e não usa consulta global", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "tenantAwareAppRouter.ts"), "utf8");
    const router = source.slice(source.indexOf("const tenantOverrides = router({"));
    expect(router).toContain("audit: router({");
    expect(router).toContain('await assertPermission(ctx.user, "audit.view")');
    expect(router).toContain("const organizationId = await tenantFor(ctx)");
    expect(router).toContain("listTenantOperationLogs({");
    expect(router).not.toContain("listOperationLogs(input)");
  });
});
