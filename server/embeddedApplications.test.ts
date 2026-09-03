import { describe, expect, it } from "vitest";
import {
  NEO_INTERACT_EMBEDDED_APPLICATION,
  buildEmbeddedApplicationAllow,
  embeddedApplicationSchema,
  embeddedCommunicationCorrelationSchema,
  parseEmbeddedFrameMessage,
} from "../shared/embeddedApplications";

describe("contratos de aplicações incorporadas", () => {
  it("mantém URL e origin do NEO separados corretamente", () => {
    expect(NEO_INTERACT_EMBEDDED_APPLICATION.src).toBe("https://gscprj.saas.digitro.cloud/neo/");
    expect(NEO_INTERACT_EMBEDDED_APPLICATION.origin).toBe("https://gscprj.saas.digitro.cloud");
  });

  it("permite somente aplicação HTTPS e origin sem caminho", () => {
    expect(embeddedApplicationSchema.safeParse({
      ...NEO_INTERACT_EMBEDDED_APPLICATION,
      src: "http://gscprj.saas.digitro.cloud/neo/",
    }).success).toBe(false);

    expect(embeddedApplicationSchema.safeParse({
      ...NEO_INTERACT_EMBEDDED_APPLICATION,
      origin: "https://gscprj.saas.digitro.cloud/neo/",
    }).success).toBe(false);
  });

  it("aceita somente o contrato conhecido de redimensionamento", () => {
    expect(parseEmbeddedFrameMessage({
      type: "TOGGLE_IFRAME_SIZE",
      isExpanded: true,
      width: 1200,
      height: 800,
    }).success).toBe(true);

    expect(parseEmbeddedFrameMessage({
      type: "EXECUTE_SCRIPT",
      code: "alert(1)",
    }).success).toBe(false);

    expect(parseEmbeddedFrameMessage({
      type: "TOGGLE_IFRAME_SIZE",
      isExpanded: true,
      width: "1200",
    }).success).toBe(false);
  });

  it("aplica canal e classificação neutros quando o provedor ainda não informa o canal real", () => {
    const parsed = embeddedCommunicationCorrelationSchema.parse({
      correlationId: "corr123456789012",
      applicationId: "neo-interact",
      eventType: "communication_started",
    });

    expect(parsed.channel).toBe("nao_informado");
    expect(parsed.classification).toBe("sessao_integrada");
  });

  it("rejeita canal e classificação fora do catálogo controlado", () => {
    expect(embeddedCommunicationCorrelationSchema.safeParse({
      correlationId: "corr123456789012",
      applicationId: "neo-interact",
      eventType: "communication_started",
      channel: "telegram",
      classification: "livre",
    }).success).toBe(false);
  });

  it("gera allow somente com permissões explícitas", () => {
    expect(buildEmbeddedApplicationAllow(NEO_INTERACT_EMBEDDED_APPLICATION.permissions))
      .toBe("camera; microphone; clipboard-write");
  });
});
