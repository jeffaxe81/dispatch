import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkflowSlaDeliveryCoordinator,
  type WorkflowSlaDeliveryStorage,
} from "./workflowSlaDeliveryCoordinator";
import type { WorkflowSlaDeliveryState } from "./workflowSlaDeliveryState";
import {
  createWorkflowSlaManualWorker,
  type WorkflowSlaManualCandidateSource,
} from "./workflowSlaManualWorker";

const now = "2026-10-18T10:00:00.000Z";
const policy = { maxAttempts: 3, leaseDurationMs: 60_000, baseRetryMs: 5_000, maxRetryMs: 30_000 };
const base: WorkflowSlaDeliveryState = {
  intentId: 10, taskId: 71, organizationId: 9,
  eventKind: "overdue", scheduledAt: now, correlationId: "corr-10",
  status: "pending", version: 0, attempts: 0,
  leaseOwner: null, leaseToken: null, leaseExpiresAt: null,
  nextAttemptAt: null, deliveredAt: null, deadLetteredAt: null,
  lastFailureCode: null,
};
const input = {
  organizationId: 9, now, limit: 2,
  workerId: "manual-worker", operatorApproved: true,
  mode: "preview" as "preview" | "lease_probe",
};

function fixture(ids: number[] = [10]) {
  const records = new Map<number, WorkflowSlaDeliveryState>(
    ids.map(id => [id, { ...base, intentId: id, taskId: 70 + id, correlationId: `corr-${id}` }]),
  );
  let reads = 0;
  let writes = 0;
  let candidateCalls = 0;
  let tokenSequence = 0;
  const storage: WorkflowSlaDeliveryStorage = {
    async loadByTenant({ intentId, organizationId }) {
      reads += 1;
      const state = records.get(intentId);
      return state && state.organizationId === organizationId ? { ...state } : null;
    },
    async compareAndSwap({ intentId, organizationId, expectedVersion, next }) {
      // Atomic fake: no awaits between version check and assignment.
      const current = records.get(intentId);
      if (!current || current.organizationId !== organizationId
        || current.version !== expectedVersion) return false;
      records.set(intentId, { ...next });
      writes += 1;
      return true;
    },
  };
  const candidates: WorkflowSlaManualCandidateSource = {
    async listDueIntentIds({ organizationId, limit }) {
      candidateCalls += 1;
      return [...records.values()]
        .filter(row => row.organizationId === organizationId
          && (row.status === "pending" || row.status === "leased"))
        .slice(0, limit).map(row => row.intentId);
    },
  };
  return {
    worker: createWorkflowSlaManualWorker({
      candidates, coordinator: createWorkflowSlaDeliveryCoordinator(storage, policy),
      tokenFactory: () => `test-token-${++tokenSequence}`,
    }),
    snapshot: (id = 10) => records.get(id),
    counters: () => ({ reads, writes, candidateCalls }),
  };
}

beforeEach(() => {
  vi.stubEnv("AXE_RUNTIME_ENV", "homologation");
  vi.stubEnv("AXE_SLA_I5C_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("D-012I I5C — operação manual controlada da fila SLA", () => {
  it("bloqueia produção, flag desativada e operador sem aprovação antes de qualquer consulta", async () => {
    const f = fixture();
    vi.stubEnv("AXE_RUNTIME_ENV", "production");
    await expect(f.worker.run(input)).rejects.toThrow(/desabilitado/);
    vi.stubEnv("AXE_RUNTIME_ENV", "homologation");
    vi.stubEnv("AXE_SLA_I5C_ENABLED", "false");
    await expect(f.worker.run(input)).rejects.toThrow(/desabilitado/);
    vi.stubEnv("AXE_SLA_I5C_ENABLED", "true");
    await expect(f.worker.run({ ...input, operatorApproved: false })).rejects.toThrow(/Aprovação/);
    expect(f.counters()).toEqual({ reads: 0, writes: 0, candidateCalls: 0 });
  });

  it("preview é estritamente leitura: nenhuma reserva, ack ou mutação", async () => {
    const f = fixture([10, 11]);
    const result = await f.worker.run(input);
    expect(result).toMatchObject({
      mode: "preview", scanned: 2, candidateIds: [10, 11],
      leased: 0, skipped: 0, contention: 0,
    });
    expect(f.counters()).toEqual({ reads: 0, writes: 0, candidateCalls: 1 });
    expect(f.snapshot()).toEqual({ ...base, taskId: 80 });
  });

  it("lease_probe só cria reservas e nunca emite recibo de entrega", async () => {
    const f = fixture([10, 11]);
    const result = await f.worker.run({ ...input, mode: "lease_probe" });
    expect(result).toMatchObject({
      leased: 2, scanned: 2, candidateIds: [10, 11],
    });
    expect(f.counters().writes).toBe(2);
    for (const id of [10, 11]) {
      expect(f.snapshot(id)).toMatchObject({
        status: "leased", attempts: 1, version: 1,
        deliveredAt: null, deadLetteredAt: null,
        leaseOwner: "manual-worker",
      });
    }
    expect(JSON.stringify(result)).not.toContain("test-token");
  });

  it("execuções concorrentes não criam leases duplicadas para o mesmo intento", async () => {
    const f = fixture();
    const [a, b] = await Promise.all([
      f.worker.run({ ...input, mode: "lease_probe" }),
      f.worker.run({ ...input, mode: "lease_probe" }),
    ]);
    expect(a.leased + b.leased).toBe(1);
    expect(a.contention + b.contention + a.skipped + b.skipped).toBe(1);
    expect(f.counters().writes).toBe(1);
    expect(f.snapshot()).toMatchObject({ status: "leased", version: 1, attempts: 1 });
  });

  it("falha fechado para ids duplicados ou acima do limite retornados pelo banco", async () => {
    const coordinator = createWorkflowSlaDeliveryCoordinator({
      async loadByTenant() { throw new Error("Não deveria consultar."); },
      async compareAndSwap() { throw new Error("Não deveria gravar."); },
    }, policy);
    for (const invalid of [[1, 1], [1, 2, 3], [-1]]) {
      const worker = createWorkflowSlaManualWorker({
        candidates: { async listDueIntentIds() { return invalid; } },
        coordinator,
      });
      await expect(worker.run(input)).rejects.toThrow(/candidatos inválidos/);
    }
  });

  it("interrompe novas gravações se a flag é desativada entre dois candidatos", async () => {
    const f = fixture([10, 11]);
    let sequence = 0;
    const store: WorkflowSlaDeliveryStorage = {
      async loadByTenant({ intentId, organizationId }) {
        const row = f.snapshot(intentId);
        return row?.organizationId === organizationId ? { ...row } : null;
      },
      async compareAndSwap() {
        vi.stubEnv("AXE_SLA_I5C_ENABLED", "false");
        return false;
      },
    };
    const worker = createWorkflowSlaManualWorker({
      candidates: { async listDueIntentIds() { return [10, 11]; } },
      coordinator: createWorkflowSlaDeliveryCoordinator(store, policy),
      tokenFactory: () => `token-${++sequence}`,
    });
    await expect(worker.run({ ...input, mode: "lease_probe" })).rejects.toThrow(/desabilitado/);
    expect(sequence).toBe(1);
  });

  it("falhas inesperadas de banco são propagadas e impedem continuar o lote", async () => {
    const coordinator = createWorkflowSlaDeliveryCoordinator({
      async loadByTenant() { throw new Error("DB indisponível"); },
      async compareAndSwap() { throw new Error("Não deveria gravar"); },
    }, policy);
    const worker = createWorkflowSlaManualWorker({
      candidates: { async listDueIntentIds() { return [10, 11]; } },
      coordinator,
    });
    await expect(worker.run({ ...input, mode: "lease_probe" })).rejects.toThrow(/DB indisponível/);
  });

  it("rejeita UTC inválido, limite excessivo, modo e identificadores incorretos", async () => {
    const f = fixture();
    await expect(f.worker.run({ ...input, limit: 21 })).rejects.toThrow(/entre 1 e 20/);
    await expect(f.worker.run({ ...input, now: "2026-02-30T10:00:00.000Z" })).rejects.toThrow(/UTC/);
    await expect(f.worker.run({ ...input, organizationId: 0 })).rejects.toThrow(/organizationId/);
    await expect(f.worker.run({ ...input, mode: "automatic" as "preview" })).rejects.toThrow(/Modo/);
    expect(f.counters().candidateCalls).toBe(0);
  });
});
