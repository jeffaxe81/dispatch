import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NodeConfigurationFields } from "./WorkflowBuilderPage";

describe("reabertura de configuração no Workflow Builder", () => {
  it("reapresenta os campos persistidos de um nó de notificação selecionado", () => {
    const markup = renderToStaticMarkup(<NodeConfigurationFields node={{ id: "notification-1", type: "notification.simulate", label: "Aviso operacional", position: { x: 100, y: 80 }, configuration: { mode: "simulacao", channel: "webhook_simulado", messageTemplate: "Alerta {{ocorrencia.codigo}}" } }} disabled={false} onChange={vi.fn()} />);

    expect(markup).toContain("Canal selecionado: webhook_simulado");
    expect(markup).toContain("Alerta {{ocorrencia.codigo}}");
  });

  it("reapresenta o campo de entrada persistido de um gatilho manual", () => {
    const markup = renderToStaticMarkup(<NodeConfigurationFields node={{ id: "trigger-1", type: "trigger.manual", label: "Entrada", position: { x: 20, y: 20 }, configuration: { mode: "simulacao", inputLabel: "entrada_reaberta" } }} disabled={false} onChange={vi.fn()} />);

    expect(markup).toContain("entrada_reaberta");
  });

  it("reapresenta a configuração homologada da entrada de dados externos", () => {
    const markup = renderToStaticMarkup(<NodeConfigurationFields node={{ id: "external-1", type: "trigger.external_data", label: "Dados ALRT", position: { x: 20, y: 20 }, configuration: { mode: "simulacao", sourceApplication: "despacho_alrt", sourceConnection: "despacho-alrt-homologacao", eventType: "alert.received", environment: "homologacao" } }} disabled={false} onChange={vi.fn()} />);

    expect(markup).toContain("Entrada de terceiros protegida.");
    expect(markup).toContain("despacho-alrt-homologacao");
    expect(markup).toContain("alert.received");
  });
});
