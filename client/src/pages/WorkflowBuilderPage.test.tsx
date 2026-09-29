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

  it("apresenta a configuração declarativa de uma decisão no-code", () => {
    const markup = renderToStaticMarkup(<NodeConfigurationFields node={{ id: "decision-1", type: "decision.condition", label: "Prioridade crítica", position: { x: 20, y: 20 }, configuration: { condition: { field: "prioridade", operator: "equals", value: "critica" } } } as any} disabled={false} onChange={vi.fn()} />);

    expect(markup).toContain("Condição no-code");
    expect(markup).toContain("prioridade");
  });

  it("apresenta o SLA congelável de uma tarefa humana", () => {
    const markup = renderToStaticMarkup(<NodeConfigurationFields node={{ id: "human-1", type: "notification.simulate", label: "Revisar despacho", position: { x: 20, y: 20 }, configuration: { channel: "painel_interno", messageTemplate: "Revisar", requiresHumanTask: true, assigneeUserId: 24, sla: { dueInMinutes: 60, reminderBeforeMinutes: 15, escalationAfterMinutes: 30, escalationMode: "notify_only" } } } as any} disabled={false} onChange={vi.fn()} />);

    expect(markup).toContain("Prazo SLA");
    expect(markup).toContain("60");
  });

  it("apresenta a referência obrigatória do formulário D-008", () => {
    const markup = renderToStaticMarkup(<NodeConfigurationFields node={{ id: "form-1", type: "form.d008", label: "Coletar evidência", position: { x: 20, y: 20 }, configuration: { formId: 7, formVersionId: 3, policy: "required_before_task_completion" } } as any} disabled={false} onChange={vi.fn()} />);

    expect(markup).toContain("Formulário D-008");
    expect(markup).toContain("7");
  });

  it("preserva um tipo legado desconhecido em modo somente leitura", () => {
    const markup = renderToStaticMarkup(<NodeConfigurationFields node={{ id: "legacy-1", type: "legacy.unsupported", label: "Etapa antiga", position: { x: 20, y: 20 }, configuration: {} } as any} disabled={false} onChange={vi.fn()} />);

    expect(markup).toContain("Tipo de nó não suportado");
    expect(markup).toContain("legacy.unsupported");
  });
});
