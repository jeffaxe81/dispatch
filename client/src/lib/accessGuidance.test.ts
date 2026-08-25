import { describe, expect, it } from "vitest";
import { getAccessGuidance } from "./accessGuidance";

describe("orientação didática de acessos", () => {
  it("explica a proteção dos perfis padrão com passos acionáveis", () => {
    const guidance = getAccessGuidance("Perfis padrão não permitem alteração de matriz ou ativação.");
    expect(guidance?.title).toBe("Perfil padrão protegido");
    expect(guidance?.steps).toHaveLength(3);
  });

  it("orienta o padrão recurso.ação de permissões locais", () => {
    const guidance = getAccessGuidance("O código da permissão deve corresponder a recurso.ação.");
    expect(guidance?.title).toBe("Código de permissão inválido");
  });

  it("explica como resolver perfis locais com código duplicado", () => {
    expect(getAccessGuidance("Já existe um perfil local com este código.")?.title).toBe("Perfil local duplicado");
  });

  it("fornece passos para completar o escopo exigido por um vínculo de perfil", () => {
    const guidance = getAccessGuidance("O escopo informado não atende ao nível exigido pelo perfil.");
    expect(guidance?.title).toBe("Escopo incompatível com o perfil");
    expect(guidance?.steps.some(step => step.includes("Organização"))).toBe(true);
  });
});
