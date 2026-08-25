import { describe, expect, it } from "vitest";
import { getSimulatedIntegrationsOverview } from "./integrations";
import { buildWorkflowAuditLog, createInitialSimulatedWorkflowDefinition, getAlrtHomologationConnectionDefaults, isExternalEventEligibleForReview, normalizeWorkflowDefinition, resolveExternalReviewWorkflow, validateWorkflowDefinition } from "./db";

describe("fundação simulada de Integrações & Workflows", () => {
  it("mantém a primeira entrega isolada de sistemas externos e de credenciais", () => {
    const overview = getSimulatedIntegrationsOverview();

    expect(overview.mode).toBe("simulation");
    expect(overview.externalRequestsEnabled).toBe(false);
    expect(overview.credentialsPersistenceEnabled).toBe(false);
  });

  it("não inventa execuções, falhas ou indicadores operacionais", () => {
    const overview = getSimulatedIntegrationsOverview();

    expect(overview.metrics).toMatchObject({
      activeWorkflows: 0,
      registeredConnections: 0,
      executionsLast24Hours: 0,
      errorsLast24Hours: 0,
      successRate: null,
      averageDurationMs: null,
    });
    expect(overview.recentExecutions).toEqual([]);
    expect(overview.failingConnections).toEqual([]);
  });

  it("define a conexão ALRT como referência de homologação sem entrega HTTP externa", () => {
    expect(getAlrtHomologationConnectionDefaults()).toMatchObject({
      code: "despacho-alrt-homologacao",
      environment: "homologacao",
      baseUrl: "https://despachoalrt-hjwc4f8q.manus.space/eventos",
      configuration: { delivery: "desativada", externalRequestsEnabled: false, authentication: "pendente" },
    });
  });

  it("inicializa a definição de workflow sem nós ou conexões não declaradas", () => {
    expect(createInitialSimulatedWorkflowDefinition()).toEqual({
      nodes: [],
      edges: [],
      metadata: { mode: "simulacao", definitionVersion: 1, automation: { requestedMode: "simulacao", activationRule: "manual", targetConnection: "nenhuma", activationStatus: "bloqueada", requiresApproval: true } },
    });
  });

  it("mantém o retrato auditável de uma alteração de workflow separado da definição do fluxo", () => {
    expect(buildWorkflowAuditLog({ workflowId: 42, actorUserId: 7, action: "update_versioned", beforeData: { currentVersion: 1 }, afterData: { currentVersion: 2, changeSummary: "Ajuste de descrição" } })).toEqual({
      resourceType: "workflow",
      resourceId: 42,
      action: "update_versioned",
      actorUserId: 7,
      beforeData: { currentVersion: 1 },
      afterData: { currentVersion: 2, changeSummary: "Ajuste de descrição" },
    });
  });

  it("impede publicar um grafo sem nós ou gatilho e aceita um gatilho simulado configurado", () => {
    expect(validateWorkflowDefinition(createInitialSimulatedWorkflowDefinition(), { forPublication: true }).errors).toEqual([
      "Um workflow publicado precisa conter nós.",
      "Um workflow publicado precisa iniciar por um gatilho.",
    ]);
    expect(validateWorkflowDefinition({ nodes: [{ id: "trigger-1", type: "trigger.manual", label: "Execução manual", position: { x: 20, y: 20 }, configuration: { mode: "simulacao", inputLabel: "entrada_manual" } }], edges: [], metadata: { mode: "simulacao", definitionVersion: 1 } }, { forPublication: true })).toMatchObject({ valid: true, errors: [] });
  });

  it("exige e preserva uma configuração válida para nós de condição e notificação", () => {
    const definition = { nodes: [
      { id: "trigger-1", type: "trigger.manual", label: "Entrada", position: { x: 20, y: 20 }, configuration: { mode: "simulacao", inputLabel: "entrada_manual" } },
      { id: "condition-1", type: "condition.if", label: "Prioridade alta", position: { x: 220, y: 20 }, configuration: { mode: "simulacao", field: "prioridade", operator: "equals", value: "alta" } },
      { id: "notification-1", type: "notification.simulate", label: "Aviso", position: { x: 420, y: 20 }, configuration: { mode: "simulacao", channel: "painel_interno", messageTemplate: "Alerta {{ocorrencia.codigo}}" } },
    ], edges: [{ id: "edge-1", source: "trigger-1", target: "condition-1" }, { id: "edge-2", source: "condition-1", target: "notification-1" }], metadata: { mode: "simulacao", definitionVersion: 1 } } as const;

    expect(validateWorkflowDefinition(definition, { forPublication: true })).toMatchObject({ valid: true, errors: [] });
    const invalid = validateWorkflowDefinition({ ...definition, nodes: definition.nodes.map(node => node.id === "notification-1" ? { ...node, configuration: { mode: "simulacao", channel: "" } } : node) }, { forPublication: true });
    expect(invalid.errors).toEqual(expect.arrayContaining(["Aviso: A notificação simulada precisa de um canal.", "Aviso: A notificação simulada precisa de uma mensagem."]));
    expect(normalizeWorkflowDefinition(definition).nodes[2]?.configuration).toEqual({ mode: "simulacao", channel: "painel_interno", messageTemplate: "Alerta {{ocorrencia.codigo}}" });
  });

  it("preserva a preparação protegida de automação e valida marcadores de início e fim", () => {
    const definition = {
      nodes: [
        { id: "trigger-1", type: "trigger.manual", label: "Entrada", position: { x: 20, y: 20 }, configuration: { mode: "simulacao", inputLabel: "entrada_manual" } },
        { id: "start-1", type: "trail.start", label: "Início da trilha", position: { x: 180, y: 20 }, configuration: { mode: "simulacao" } },
        { id: "incident-1", type: "occurrence.create", label: "Preencher ocorrência", position: { x: 340, y: 20 }, configuration: { mode: "simulacao", category: "Iluminação", priority: "alta", status: "triagem", origin: "integracao", address: "Rua de teste", latitude: "-26.9", longitude: "-48.6" } },
        { id: "end-1", type: "trail.end", label: "Fim da trilha", position: { x: 500, y: 20 }, configuration: { mode: "simulacao" } },
      ],
      edges: [{ id: "edge-1", source: "trigger-1", target: "start-1" }, { id: "edge-2", source: "start-1", target: "incident-1" }, { id: "edge-3", source: "incident-1", target: "end-1" }],
      metadata: { mode: "simulacao", definitionVersion: 1, automation: { requestedMode: "producao_protegida", activationRule: "incident.created", targetConnection: "despacho-alrt-eventos", activationStatus: "liberada", requiresApproval: false } },
    } as const;

    const normalized = normalizeWorkflowDefinition(definition);
    expect(normalized.metadata.automation).toEqual({ requestedMode: "producao_protegida", activationRule: "incident.created", targetConnection: "despacho-alrt-eventos", activationStatus: "bloqueada", requiresApproval: true });
    expect(validateWorkflowDefinition(definition, { forPublication: true })).toMatchObject({ valid: true, errors: [], warnings: [expect.stringContaining("automação real está apenas preparada")] });
  });

  it("aceita a entrada externa homologada antes do início explícito da trilha", () => {
    const definition = {
      nodes: [
        { id: "external-1", type: "trigger.external_data", label: "Receber dados externos", position: { x: 20, y: 20 }, configuration: { mode: "simulacao", sourceApplication: "despacho_alrt", sourceConnection: "despacho-alrt-homologacao", eventType: "alert.received", environment: "homologacao" } },
        { id: "start-1", type: "trail.start", label: "Início da trilha", position: { x: 220, y: 20 }, configuration: { mode: "simulacao" } },
        { id: "end-1", type: "trail.end", label: "Fim da trilha", position: { x: 420, y: 20 }, configuration: { mode: "simulacao" } },
      ],
      edges: [{ id: "edge-1", source: "external-1", target: "start-1" }, { id: "edge-2", source: "start-1", target: "end-1" }],
      metadata: { mode: "simulacao", definitionVersion: 1, automation: { requestedMode: "producao_protegida", activationRule: "integration.alrt_alert", targetConnection: "despacho-alrt-homologacao", activationStatus: "bloqueada", requiresApproval: true } },
    } as const;

    expect(validateWorkflowDefinition(definition, { forPublication: true })).toMatchObject({ valid: true, errors: [] });
    const invalid = validateWorkflowDefinition({ ...definition, nodes: definition.nodes.map(node => node.id === "external-1" ? { ...node, configuration: { ...node.configuration, environment: "producao" } } : node) }, { forPublication: true });
    expect(invalid.errors).toEqual(expect.arrayContaining(["Receber dados externos: A entrada externa só pode ser configurada para homologação nesta etapa."]));
  });

  it("identifica a etapa de criação que exige revisão humana na trilha externa", () => {
    const definition = {
      nodes: [
        { id: "external", type: "trigger.external_data", label: "ALRT", position: { x: 20, y: 20 }, configuration: { mode: "simulacao", sourceApplication: "despacho_alrt", sourceConnection: "despacho-alrt-homologacao", eventType: "alert.received", environment: "homologacao" } },
        { id: "start", type: "trail.start", label: "Início", position: { x: 180, y: 20 }, configuration: { mode: "simulacao" } },
        { id: "review", type: "occurrence.create", label: "Revisar ocorrência", position: { x: 340, y: 20 }, configuration: { mode: "simulacao", creationMode: "revisao_obrigatoria", category: "{{alert.category}}", priority: "{{alert.priority}}", origin: "integracao", description: "{{alert.description}}", address: "{{alert.address}}", latitude: "{{alert.latitude}}", longitude: "{{alert.longitude}}" } },
        { id: "end", type: "trail.end", label: "Fim", position: { x: 500, y: 20 }, configuration: { mode: "simulacao" } },
      ],
      edges: [{ id: "1", source: "external", target: "start" }, { id: "2", source: "start", target: "review" }, { id: "3", source: "review", target: "end" }],
      metadata: { mode: "simulacao", definitionVersion: 1 },
    };
    expect(resolveExternalReviewWorkflow(definition, { system: "despacho_alrt", eventType: "alert.received", environment: "homologacao" })?.occurrence.id).toBe("review");
    expect(resolveExternalReviewWorkflow(definition, { system: "despacho_alrt", eventType: "alert.received", environment: "producao" })).toBeNull();
    const incomplete = { ...definition, nodes: definition.nodes.map(node => node.id === "review" ? { ...node, configuration: { ...node.configuration, description: "", address: "", latitude: "", longitude: "" } } : node) };
    expect(validateWorkflowDefinition(incomplete, { forPublication: true }).errors).toEqual(expect.arrayContaining([
      "Revisar ocorrência: A revisão humana precisa mapear descrição.",
      "Revisar ocorrência: A revisão humana precisa mapear endereço.",
      "Revisar ocorrência: A revisão humana precisa mapear latitude.",
      "Revisar ocorrência: A revisão humana precisa mapear longitude.",
    ]));
  });

  it("reconcilia somente eventos recebidos após a publicação da trilha", () => {
    const publishedAt = new Date("2026-08-22T17:00:00.000Z");
    expect(isExternalEventEligibleForReview(new Date("2026-08-22T16:59:59.999Z"), publishedAt)).toBe(false);
    expect(isExternalEventEligibleForReview(new Date("2026-08-22T17:00:00.000Z"), publishedAt)).toBe(true);
    expect(isExternalEventEligibleForReview(new Date("2026-08-22T17:00:01.000Z"), publishedAt)).toBe(true);
  });
});
