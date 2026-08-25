import { describe, expect, it } from "vitest";
import { getInternalOpenapiCatalog, parseOpenapiDocument } from "./openapi";

describe("analisador OpenAPI em simulação", () => {
  it("importa JSON 3.1, extrai operações e mascara exemplos sensíveis", () => {
    const parsed = parseOpenapiDocument(JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Frota Municipal", version: "2.4.0", description: "Catálogo externo de referência" },
      paths: {
        "/vehicles/{id}": {
          get: { operationId: "getVehicle", summary: "Consultar viatura", parameters: [{ name: "Authorization", in: "header", example: "Bearer segredo-real" }], responses: { "200": { description: "ok" } } },
        },
      },
    }));

    expect(parsed).toMatchObject({ name: "Frota Municipal", apiVersion: "2.4.0", openapiVersion: "3.1.0", importFormat: "json" });
    expect(parsed.operations).toEqual([expect.objectContaining({ operationKey: "getvehicle", method: "GET", path: "/vehicles/{id}" })]);
    expect(JSON.stringify(parsed.document)).not.toContain("segredo-real");
    expect(JSON.stringify(parsed.document)).toContain("••••••••");
  });

  it("importa YAML e preserva operações suportadas sem executar qualquer chamada", () => {
    const parsed = parseOpenapiDocument(`openapi: 3.0.3
info:
  title: Dispatch API
  version: v1
paths:
  /dispatch:
    post:
      summary: Criar despacho
      tags: [Dispatch]
      responses:
        '202':
          description: Aceito
`, "yaml");

    expect(parsed.importFormat).toBe("yaml");
    expect(parsed.operations[0]).toMatchObject({ method: "POST", path: "/dispatch", summary: "Criar despacho", tags: ["Dispatch"] });
  });

  it("rejeita versões diferentes de OpenAPI 3.0 e 3.1", () => {
    expect(() => parseOpenapiDocument(JSON.stringify({ openapi: "2.0", info: { title: "Legado", version: "1" }, paths: { "/ping": { get: { responses: { "200": { description: "ok" } } } } } }))).toThrow(/OpenAPI 3.0 ou 3.1/);
  });

  it("mantém o catálogo interno apontando para ambiente inválido de simulação", () => {
    const catalog = getInternalOpenapiCatalog();
    expect(catalog.servers[0].url).toContain("simulation.invalid");
    expect(catalog.paths["/integracoes/eventos"].get["x-simulation-only"]).toBe(true);
  });

  it("documenta o receptor ALRT de homologação com autenticação e respostas seguras", () => {
    const catalog = getInternalOpenapiCatalog();
    const endpoint = catalog.paths["/api/integrations/alrt/events"].post;
    expect(endpoint["x-homologation-only"]).toBe(true);
    expect(endpoint.parameters.map(parameter => parameter.name)).toEqual(expect.arrayContaining(["X-ALRT-API-Key", "X-Timestamp", "X-Signature"]));
    expect(endpoint.responses).toHaveProperty("429");
  });
});
