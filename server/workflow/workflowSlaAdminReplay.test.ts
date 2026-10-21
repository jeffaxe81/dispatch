import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowSlaAdminReplayService,
  type WorkflowSlaAdminReplayStore,
} from "./workflowSlaAdminReplay";
import type { WorkflowSlaDeliveryState } from "./workflowSlaDeliveryState";

const deadLetter: WorkflowSlaDeliveryState = {
  intentId: 44,
  taskId: 12,
  organizationId: 9,
  eventKind: "overdue",
  scheduledAt: "2026-10-18T18:00:00.000Z",
  correlationId: "corr-44",
  status: "dead_letter",
  version: 7,
  attempts: 3,
  leaseOwner: null,
  leaseToken: null,
  leaseExpiresAt: null,
  nextAttemptAt: null,
  deliveredAt: null,
  deadLetteredAt: "2026-10-18T18:05:00.000Z",
  lastFailureCode: "unavailable",
};

function store(snapshot = deadLetter): WorkflowSlaAdminReplayStore {
  return {
    transaction: vi.fn(async callback =>
      callback({
        loadForUpdate: vi.fn(async () => ({
          state: snapshot,
          taskActive: true,
        })),
        commitReplay: vi.fn(async () => undefined),
      }),
    ),
  };
}

describe("D-012I I5F — replay administrativo de quarentena", () => {
  it("reabre somente dead_letter como pending em nova versão e nova rodada de tentativas", async () => {
    const persistence = store();
    const service = createWorkflowSlaAdminReplayService(persistence);
    const result = await service.replay({
      intentId: 44,
      organizationId: 9,
      actorUserId: 77,
      reason: "Falha externa corrigida",
      administratorApproved: true,
      now: "2026-10-20T18:30:00.000Z",
    });

    expect(result).toEqual({
      intentId: 44,
      organizationId: 9,
      status: "pending",
      version: 8,
    });
    const tx = (persistence.transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const probe = {
      loadForUpdate: vi.fn(async () => ({ state: deadLetter, taskActive: true })),
      commitReplay: vi.fn(async () => undefined),
    };
    await tx(probe);
    expect(probe.commitReplay).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 77,
      reason: "Falha externa corrigida",
      current: deadLetter,
      next: expect.objectContaining({
        status: "pending",
        version: 8,
        attempts: 0,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        deliveredAt: null,
        deadLetteredAt: null,
      }),
    }));
  });

  it("falha fechado para estado não quarantinado ou tarefa encerrada", async () => {
    const pending = { ...deadLetter, status: "pending" as const, deadLetteredAt: null };
    await expect(
      createWorkflowSlaAdminReplayService(store(pending)).replay({
        intentId: 44, organizationId: 9, actorUserId: 77,
        reason: "tentativa", administratorApproved: true,
        now: "2026-10-20T18:30:00.000Z",
      }),
    ).rejects.toThrow(/dead.?letter|quarentena/i);

    const closed: WorkflowSlaAdminReplayStore = {
      transaction: async callback => callback({
        loadForUpdate: async () => ({ state: deadLetter, taskActive: false }),
        commitReplay: vi.fn(),
      }),
    };
    await expect(
      createWorkflowSlaAdminReplayService(closed).replay({
        intentId: 44, organizationId: 9, actorUserId: 77,
        reason: "tentativa", administratorApproved: true,
        now: "2026-10-20T18:30:00.000Z",
      }),
    ).rejects.toThrow(/tarefa.*ativa/i);
  });

  it("exige aprovação administrativa, tenant, ator, justificativa e UTC antes da transação", async () => {
    const persistence = store();
    const service = createWorkflowSlaAdminReplayService(persistence);
    const base = {
      intentId: 44, organizationId: 9, actorUserId: 77,
      reason: "reanálise autorizada", administratorApproved: true,
      now: "2026-10-20T18:30:00.000Z",
    };
    await expect(service.replay({ ...base, administratorApproved: false })).rejects.toThrow(/administr/i);
    await expect(service.replay({ ...base, organizationId: 0 })).rejects.toThrow(/organization/i);
    await expect(service.replay({ ...base, actorUserId: 0 })).rejects.toThrow(/ator/i);
    await expect(service.replay({ ...base, reason: " " })).rejects.toThrow(/justificativa/i);
    await expect(service.replay({ ...base, now: "2026-10-20 18:30:00" })).rejects.toThrow(/UTC/i);
    expect(persistence.transaction).not.toHaveBeenCalled();
  });

  it("não revela intenção de outro tenant e não confirma entrega", async () => {
    const missing: WorkflowSlaAdminReplayStore = {
      transaction: async callback => callback({
        loadForUpdate: async () => null,
        commitReplay: vi.fn(),
      }),
    };
    await expect(
      createWorkflowSlaAdminReplayService(missing).replay({
        intentId: 44, organizationId: 9, actorUserId: 77,
        reason: "reanálise", administratorApproved: true,
        now: "2026-10-20T18:30:00.000Z",
      }),
    ).rejects.toThrow(/não encontrada.*escopo/i);
  });
});
