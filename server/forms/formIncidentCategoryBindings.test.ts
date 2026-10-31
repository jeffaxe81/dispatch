import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mergeAuthorizedIncidentCategoryBindings } from "./formIncidentCategoryBindings";
import { createFormsApi } from "./formsRouter";
import { createFormService, type FormServicePorts } from "./formService";

const direct = { id: 1, formId: 10, formVersionId: 20, contextType: "incident", contextId: "88", tenantId: 7 };
const fromCategory = { id: 2, formId: 11, formVersionId: 21, contextType: "incident_category", contextId: "Alagamento", tenantId: 7 };

describe("AXED-F021 — modelos por categoria autorizada", () => {
  it("mescla vínculo explícito e modelo herdado da categoria no contexto da ocorrência", () => {
    expect(mergeAuthorizedIncidentCategoryBindings("88", "Alagamento", [direct], [fromCategory]))
      .toEqual([
        { ...direct, inheritedFromCategory: false },
        { ...fromCategory, contextType: "incident", contextId: "88", inheritedFromCategory: true },
      ]);
  });
  it("vínculo explícito de formulário prevalece sobre padrão da mesma categoria", () => {
    const inherited = { ...fromCategory, formId: direct.formId, formVersionId: 99 };
    expect(mergeAuthorizedIncidentCategoryBindings("88", "Alagamento", [direct], [inherited]))
      .toEqual([{ ...direct, inheritedFromCategory: false }]);
  });
  it("ignora outra categoria e outro incidente, sem ampliar conjunto autorizado", () => {
    const out = mergeAuthorizedIncidentCategoryBindings("88", "Alagamento",
      [{ ...direct, contextId: "99" }],
      [{ ...fromCategory, contextId: "Incêndio" }]);
    expect(out).toEqual([]);
  });
  it("sem categoria segura, somente o vínculo individual válido é exposto", () => {
    expect(mergeAuthorizedIncidentCategoryBindings("88", undefined, [direct], [fromCategory]))
      .toEqual([{ ...direct, inheritedFromCategory: false }]);
    expect(() => mergeAuthorizedIncidentCategoryBindings("0", "Alagamento", [direct], [fromCategory])).toThrow();
  });
  it("o serviço busca a categoria e entrega definição da versão publicada sem mudar a ocorrência", async () => {
    const listBindings = vi.fn(async (filter: {contextType: string; contextId: string}) =>
      filter.contextType === "incident" ? [direct] : [fromCategory]);
    const service = createFormService(7, {
      repository: {
        listBindings,
        listSubmissionsForIncident: vi.fn(async () => []),
        getTemplate: vi.fn(async (id: number) => ({ id, tenantId: 7, name: "Modelo " + id })),
        getVersion: vi.fn(async (id: number) => ({ id, tenantId: 7, formId: id === 20 ? 10 : 11, version: 1, status: "published", definition: { schemaVersion: 1, title: "Teste", fields: [] } })),
      },
      audit: { append: vi.fn() }, events: { append: vi.fn() },
    } as unknown as FormServicePorts);
    const out = await service.forIncident({ incidentId: "88", incidentCategory: "Alagamento" });
    expect(listBindings).toHaveBeenCalledWith({ contextType: "incident", contextId: "88" });
    expect(listBindings).toHaveBeenCalledWith({ contextType: "incident_category", contextId: "Alagamento" });
    expect(out.bindings).toHaveLength(2);
    expect(out.bindings[1]).toMatchObject({ formId: 11, contextType: "incident", contextId: "88", inheritedFromCategory: true });
    expect(out.incidentTransitionRequested).toBe(false);
  });
  it("o contexto ignora categoria enviada pelo cliente e consulta a derivada pelo servidor", async () => {
    const seq: string[] = [];
    const assertIncidentScope = vi.fn(async () => { seq.push("scope"); });
    const resolveIncidentCategory = vi.fn(async () => { seq.push("category"); return "Alagamento"; });
    const forIncident = vi.fn(async input => input);
    const api = createFormsApi({
      tenantId: 7, userId: 19,
      hasPermission: vi.fn(async () => true),
      assertIncidentScope, resolveIncidentCategory,
      assertFieldActivityScope: vi.fn(), assertSubmissionScope: vi.fn(),
      service: { forIncident },
    });
    await api.forIncident({ incidentId: "88", incidentCategory: "OUTRO_TENANT" });
    expect(seq).toEqual(["scope", "category"]);
    expect(forIncident).toHaveBeenCalledWith(expect.objectContaining({
      incidentId: "88", incidentCategory: "Alagamento", tenantId: 7, actorUserId: 19,
    }));
  });
  it("runtime obtém categoria por registro da ocorrência com escopo do tenant e RBAC", () => {
    const runtime = fs.readFileSync(path.resolve(import.meta.dirname, "formsRuntimeContext.ts"), "utf8");
    const router = fs.readFileSync(path.resolve(import.meta.dirname, "formsTrpcRouter.ts"), "utf8");
    expect(runtime).toContain("getIncidentForTenant(tenantId, Number(incidentId))");
    expect(runtime).toContain("assertCanReadIncident(user, row.incident)");
    expect(router).toContain("forIncident:strict({incidentId:");
    expect(router).not.toContain("forIncident:strict({incidentId:id,incidentCategory:");
  });
});
