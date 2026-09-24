import { describe, expect, it } from "vitest";

const serviceModulePath = "./workflowEventTriggerService";
const loadService = () => import(serviceModulePath);

const envelope = {
  envelopeVersion: "1",
  eventId: "dispatch-event-1001",
  eventType: "incident.created.v1",
  occurredAt: "2026-09-13T20:40:00.000Z",
  tenantId: "42",
  correlationId: "corr-trigger-service-0001",
  actorUserId: "7",
  producer: "axe-dispatch",
  payload: { incidentId: 99 },
} as const;

function createHarness(options: {
  duplicate?: boolean;
  candidates?: Array<Record<string, unknown>>;
  waitingCandidates?: Array<Record<string, unknown>>;
} = {}) {
  const starts: Array<Record<string, unknown>> = [];
  const resumes: Array<Record<string, unknown>> = [];
  const completions: Array<Record<string, unknown>> = [];
  const claims: Array<Record<string, unknown>> = [];
  const candidates = options.candidates ?? [{
    workflowId: 1,
    workflowVersionId: 101,
    tenantId: "42",
    triggerNodeId: "trigger-external",
  }];
  const waitingCandidates = options.waitingCandidates ?? [];

  return {
    starts,
    resumes,
    completions,
    claims,
    dependencies: {
      claimReceipt: async (event: Record<string, unknown>) => {
        claims.push(event);
        return options.duplicate
          ? { status: "duplicate" as const, tenantId: String(event.tenantId), eventId: String(event.eventId) }
          : { status: "claimed" as const, tenantId: String(event.tenantId), eventId: String(event.eventId) };
      },
      findStartCandidates: async (input: { tenantId: string; eventType: string }) =>
        candidates.filter(candidate => candidate.tenantId === input.tenantId),
      findWaitingCandidates: async (input: { tenantId: string; eventType: string }) =>
        waitingCandidates.filter(candidate => candidate.tenantId === input.tenantId),
      startInstance: async (input: Record<string, unknown>) => {
        starts.push(input);
        return { executionId: starts.length };
      },
      resumeInstance: async (input: Record<string, unknown>) => {
        resumes.push(input);
        return { executionId: Number(input.executionId) };
      },
      completeReceipt: async (input: Record<string, unknown>) => {
        completions.push(input);
      },
    },
  };
}

describe("D-012F workflow event trigger service", () => {
  it("inicia exatamente a instância elegível do mesmo tenant e preserva correlationId", async () => {
    const { createWorkflowEventTriggerService } = await loadService();
    const harness = createHarness();
    const service = createWorkflowEventTriggerService(harness.dependencies);

    const result = await service.consume(envelope, 7);

    expect(result).toEqual({ status: "processed", eventId: envelope.eventId, executionIds: [1] });
    expect(harness.starts).toEqual([expect.objectContaining({
      workflowId: 1,
      workflowVersionId: 101,
      tenantId: "42",
      triggerNodeId: "trigger-external",
      correlationId: envelope.correlationId,
      eventId: envelope.eventId,
      actorUserId: 7,
    })]);
    expect(harness.resumes).toHaveLength(0);
    expect(harness.completions).toEqual([expect.objectContaining({
      tenantId: "42",
      eventId: envelope.eventId,
      status: "processed",
      workflowExecutionId: 1,
    })]);
  });

  it("retoma exatamente uma instância waiting em wait.event quando não há start elegível", async () => {
    const { createWorkflowEventTriggerService } = await loadService();
    const harness = createHarness({
      candidates: [],
      waitingCandidates: [{
        executionId: 77,
        workflowId: 9,
        workflowVersionId: 901,
        tenantId: "42",
        currentNodeId: "wait-incident-created",
        targetNodeId: "notify-after-wait",
      }],
    });
    const service = createWorkflowEventTriggerService(harness.dependencies);

    await expect(service.consume(envelope, 7)).resolves.toEqual({
      status: "processed",
      eventId: envelope.eventId,
      executionIds: [77],
    });
    expect(harness.starts).toHaveLength(0);
    expect(harness.resumes).toEqual([expect.objectContaining({
      executionId: 77,
      workflowVersionId: 901,
      tenantId: "42",
      currentNodeId: "wait-incident-created",
      targetNodeId: "notify-after-wait",
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      correlationId: envelope.correlationId,
      actorUserId: 7,
    })]);
    expect(harness.completions).toEqual([expect.objectContaining({
      status: "processed",
      workflowExecutionId: 77,
    })]);
  });

  it("falha fechado quando o mesmo evento encontra mais de um efeito elegível", async () => {
    const { createWorkflowEventTriggerService } = await loadService();
    const harness = createHarness({
      waitingCandidates: [{
        executionId: 77,
        workflowId: 9,
        workflowVersionId: 901,
        tenantId: "42",
        currentNodeId: "wait-incident-created",
        targetNodeId: "notify-after-wait",
      }],
    });
    const service = createWorkflowEventTriggerService(harness.dependencies);

    await expect(service.consume(envelope, 7)).resolves.toEqual({
      status: "failed",
      eventId: envelope.eventId,
      executionIds: [],
      failureCode: "WORKFLOW_EVENT_TRIGGER_AMBIGUOUS",
    });
    expect(harness.starts).toHaveLength(0);
    expect(harness.resumes).toHaveLength(0);
    expect(harness.completions).toEqual([expect.objectContaining({
      status: "failed",
      failureCode: "WORKFLOW_EVENT_TRIGGER_AMBIGUOUS",
    })]);
  });

  it("marca ignored quando não há workflow elegível", async () => {
    const { createWorkflowEventTriggerService } = await loadService();
    const harness = createHarness({ candidates: [], waitingCandidates: [] });
    const service = createWorkflowEventTriggerService(harness.dependencies);

    await expect(service.consume(envelope, 7)).resolves.toEqual({
      status: "ignored",
      eventId: envelope.eventId,
      executionIds: [],
    });
    expect(harness.starts).toHaveLength(0);
    expect(harness.resumes).toHaveLength(0);
    expect(harness.completions).toEqual([expect.objectContaining({ status: "ignored" })]);
  });

  it("fecha o recibo como failed quando o matching falha depois do claim", async () => {
    const { createWorkflowEventTriggerService } = await loadService();
    const harness = createHarness();
    harness.dependencies.findStartCandidates = async () => {
      throw new Error("matching indisponível");
    };
    const service = createWorkflowEventTriggerService(harness.dependencies);

    await expect(service.consume(envelope, 7)).rejects.toThrow("matching indisponível");
    expect(harness.completions).toEqual([expect.objectContaining({
      tenantId: "42",
      eventId: envelope.eventId,
      status: "failed",
      failureCode: "WORKFLOW_EVENT_TRIGGER_MATCH_FAILED",
    })]);
    expect(harness.starts).toHaveLength(0);
    expect(harness.resumes).toHaveLength(0);
  });

  it("fecha o recibo como failed quando o start falha depois do claim", async () => {
    const { createWorkflowEventTriggerService } = await loadService();
    const harness = createHarness();
    harness.dependencies.startInstance = async () => {
      throw new Error("falha simulada no start");
    };
    const service = createWorkflowEventTriggerService(harness.dependencies);

    await expect(service.consume(envelope, 7)).rejects.toThrow("falha simulada no start");
    expect(harness.completions).toEqual([expect.objectContaining({
      tenantId: "42",
      eventId: envelope.eventId,
      status: "failed",
      failureCode: "WORKFLOW_EVENT_TRIGGER_START_FAILED",
    })]);
  });

  it("replay retorna duplicate sem segundo efeito", async () => {
    const { createWorkflowEventTriggerService } = await loadService();
    const harness = createHarness({ duplicate: true });
    const service = createWorkflowEventTriggerService(harness.dependencies);

    await expect(service.consume(envelope, 7)).resolves.toEqual({
      status: "duplicate",
      eventId: envelope.eventId,
      executionIds: [],
    });
    expect(harness.starts).toHaveLength(0);
    expect(harness.resumes).toHaveLength(0);
    expect(harness.completions).toHaveLength(0);
  });

  it("não inicia candidato de outro tenant e valida o envelope antes do claim", async () => {
    const { createWorkflowEventTriggerService } = await loadService();
    const crossTenant = createHarness({ candidates: [{
      workflowId: 9,
      workflowVersionId: 909,
      tenantId: "77",
      triggerNodeId: "trigger-external",
    }] });
    const service = createWorkflowEventTriggerService(crossTenant.dependencies);

    await expect(service.consume(envelope, 7)).resolves.toMatchObject({ status: "ignored" });
    expect(crossTenant.starts).toHaveLength(0);

    const invalid = createHarness();
    const invalidService = createWorkflowEventTriggerService(invalid.dependencies);
    await expect(invalidService.consume({ ...envelope, envelopeVersion: "2" } as never, 7)).rejects.toThrow();
    expect(invalid.claims).toHaveLength(0);
  });

  it("mantém a API de produção consumeWorkflowEvent disponível", async () => {
    const module = await loadService();
    expect(typeof module.consumeWorkflowEvent).toBe("function");
  });
});
