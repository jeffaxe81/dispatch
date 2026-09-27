import {
  workflowEventEnvelopeSchema,
  type WorkflowEventEnvelope,
} from "../../shared/workflowIntegration/v1";

export type WorkflowEventStartCandidate = {
  workflowId: number;
  workflowVersionId: number;
  tenantId: string;
  triggerNodeId: string;
};

export type WorkflowEventWaitingCandidate = {
  executionId: number;
  workflowId: number;
  workflowVersionId: number;
  tenantId: string;
  currentNodeId: string;
  targetNodeId: string;
};

export type WorkflowEventTriggerDependencies = {
  claimReceipt(event: WorkflowEventEnvelope): Promise<
    | { status: "claimed"; tenantId: string; eventId: string }
    | { status: "duplicate"; tenantId: string; eventId: string }
  >;
  findStartCandidates(input: {
    tenantId: string;
    eventType: WorkflowEventEnvelope["eventType"];
    producer: WorkflowEventEnvelope["producer"];
  }): Promise<WorkflowEventStartCandidate[]>;
  findWaitingCandidates(input: {
    tenantId: string;
    eventType: WorkflowEventEnvelope["eventType"];
    producer: WorkflowEventEnvelope["producer"];
  }): Promise<WorkflowEventWaitingCandidate[]>;
  startInstance(input: {
    workflowId: number;
    workflowVersionId: number;
    tenantId: string;
    triggerNodeId: string;
    eventId: string;
    eventType: WorkflowEventEnvelope["eventType"];
    producer: WorkflowEventEnvelope["producer"];
    correlationId: string;
    actorUserId: number;
    payload: Record<string, unknown>;
  }): Promise<{ executionId: number }>;
  resumeInstance(input: {
    executionId: number;
    workflowId: number;
    workflowVersionId: number;
    tenantId: string;
    currentNodeId: string;
    targetNodeId: string;
    eventId: string;
    eventType: WorkflowEventEnvelope["eventType"];
    producer: WorkflowEventEnvelope["producer"];
    correlationId: string;
    actorUserId: number;
    payload: Record<string, unknown>;
  }): Promise<{ executionId: number }>;
  completeReceipt(input: {
    tenantId: string;
    eventId: string;
    status: "processed" | "ignored" | "failed";
    workflowExecutionId?: number | null;
    failureCode?: string | null;
  }): Promise<void>;
};

export type WorkflowEventTriggerResult =
  | { status: "processed"; eventId: string; executionIds: number[] }
  | { status: "ignored"; eventId: string; executionIds: [] }
  | { status: "duplicate"; eventId: string; executionIds: [] }
  | { status: "failed"; eventId: string; executionIds: []; failureCode: string };

function assertActorUserId(actorUserId: number) {
  if (!Number.isInteger(actorUserId) || actorUserId < 1) {
    throw new Error("actorUserId deve ser um inteiro positivo para consumir evento de workflow.");
  }
}

export function createWorkflowEventTriggerService(dependencies: WorkflowEventTriggerDependencies) {
  return {
    async consume(input: WorkflowEventEnvelope, actorUserId: number): Promise<WorkflowEventTriggerResult> {
      const envelope = workflowEventEnvelopeSchema.parse(input);
      assertActorUserId(actorUserId);

      const claim = await dependencies.claimReceipt(envelope);
      if (claim.status === "duplicate") {
        return { status: "duplicate", eventId: envelope.eventId, executionIds: [] };
      }

      let startCandidates: WorkflowEventStartCandidate[];
      let waitingCandidates: WorkflowEventWaitingCandidate[];
      try {
        startCandidates = (await dependencies.findStartCandidates({
          tenantId: envelope.tenantId,
          eventType: envelope.eventType,
          producer: envelope.producer,
        })).filter(candidate => candidate.tenantId === envelope.tenantId);
        waitingCandidates = (await dependencies.findWaitingCandidates({
          tenantId: envelope.tenantId,
          eventType: envelope.eventType,
          producer: envelope.producer,
        })).filter(candidate => candidate.tenantId === envelope.tenantId);
      } catch (error) {
        await dependencies.completeReceipt({
          tenantId: envelope.tenantId,
          eventId: envelope.eventId,
          status: "failed",
          failureCode: "WORKFLOW_EVENT_TRIGGER_MATCH_FAILED",
        });
        throw error;
      }

      const effectCount = startCandidates.length + waitingCandidates.length;
      if (effectCount === 0) {
        await dependencies.completeReceipt({
          tenantId: envelope.tenantId,
          eventId: envelope.eventId,
          status: "ignored",
        });
        return { status: "ignored", eventId: envelope.eventId, executionIds: [] };
      }

      if (effectCount > 1) {
        const failureCode = "WORKFLOW_EVENT_TRIGGER_AMBIGUOUS";
        await dependencies.completeReceipt({
          tenantId: envelope.tenantId,
          eventId: envelope.eventId,
          status: "failed",
          failureCode,
        });
        return { status: "failed", eventId: envelope.eventId, executionIds: [], failureCode };
      }

      if (waitingCandidates.length === 1) {
        const candidate = waitingCandidates[0];
        let resumed: { executionId: number };
        try {
          resumed = await dependencies.resumeInstance({
            executionId: candidate.executionId,
            workflowId: candidate.workflowId,
            workflowVersionId: candidate.workflowVersionId,
            tenantId: envelope.tenantId,
            currentNodeId: candidate.currentNodeId,
            targetNodeId: candidate.targetNodeId,
            eventId: envelope.eventId,
            eventType: envelope.eventType,
            producer: envelope.producer,
            correlationId: envelope.correlationId,
            actorUserId,
            payload: { ...envelope.payload },
          });
        } catch (error) {
          await dependencies.completeReceipt({
            tenantId: envelope.tenantId,
            eventId: envelope.eventId,
            status: "failed",
            failureCode: "WORKFLOW_EVENT_TRIGGER_RESUME_FAILED",
          });
          throw error;
        }

        await dependencies.completeReceipt({
          tenantId: envelope.tenantId,
          eventId: envelope.eventId,
          status: "processed",
          workflowExecutionId: resumed.executionId,
        });
        return {
          status: "processed",
          eventId: envelope.eventId,
          executionIds: [resumed.executionId],
        };
      }

      const candidate = startCandidates[0];
      let started: { executionId: number };
      try {
        started = await dependencies.startInstance({
          workflowId: candidate.workflowId,
          workflowVersionId: candidate.workflowVersionId,
          tenantId: envelope.tenantId,
          triggerNodeId: candidate.triggerNodeId,
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          producer: envelope.producer,
          correlationId: envelope.correlationId,
          actorUserId,
          payload: { ...envelope.payload },
        });
      } catch (error) {
        await dependencies.completeReceipt({
          tenantId: envelope.tenantId,
          eventId: envelope.eventId,
          status: "failed",
          failureCode: "WORKFLOW_EVENT_TRIGGER_START_FAILED",
        });
        throw error;
      }

      await dependencies.completeReceipt({
        tenantId: envelope.tenantId,
        eventId: envelope.eventId,
        status: "processed",
        workflowExecutionId: started.executionId,
      });

      return {
        status: "processed",
        eventId: envelope.eventId,
        executionIds: [started.executionId],
      };
    },
  };
}

export async function consumeWorkflowEvent(
  input: WorkflowEventEnvelope,
  actorUserId: number,
): Promise<WorkflowEventTriggerResult> {
  const modulePath = "./workflowEventTriggerPersistence";
  const { consumeWorkflowEventPersisted } = await import(modulePath);
  return consumeWorkflowEventPersisted(input, actorUserId);
}
