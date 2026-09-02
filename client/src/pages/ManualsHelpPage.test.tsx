import { describe, expect, it } from "vitest";
import { defaultProfileEntries, faqEntries, filterFaqEntries, filterManualEntries, manualEntries } from "./ManualsHelpPage";

describe("ManualsHelpContent", () => {
  it("mantém os sete guias operacionais e a FAQ de apoio", () => {
    expect(manualEntries).toHaveLength(7);
    expect(manualEntries.map(manual => manual.id)).toEqual(expect.arrayContaining(["equipes", "viaturas", "ocorrencias", "aplicativo-agente", "revisao-evento-externo"]));
    expect(faqEntries.map(faq => faq.id)).toEqual(expect.arrayContaining(["equipes-situacao", "viaturas-acesso"]));
    expect(manualEntries.find(manual => manual.id === "triagem-critica")?.steps).toContain("Adicione Execução manual, Condição / IF, Transformar dados, Criar ocorrência, Simular despacho e Notificação simulada.");
  });

  it("localiza assuntos sem depender de acentos e consulta a FAQ relacionada", () => {
    expect(filterManualEntries("evidencias").map(manual => manual.id)).toContain("aplicativo-agente");
    expect(filterManualEntries("prioridade").map(manual => manual.id)).toContain("ocorrencias");
    expect(filterManualEntries("viatura").map(manual => manual.id)).toContain("viaturas");
    expect(filterFaqEntries("localizacao").map(faq => faq.id)).toContain("agente-localizacao");
  });

  it("lista os 5 perfis padrão, incluindo agente_campo (exigido por server/accessCatalog.ts)", () => {
    expect(defaultProfileEntries).toHaveLength(5);
    expect(defaultProfileEntries.map(profile => profile.code)).toEqual(["administrador", "supervisor", "despachador", "agente_campo", "agente_seguranca"]);
  });
});
