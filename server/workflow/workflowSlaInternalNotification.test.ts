import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkflowSlaInternalNotificationService,
  type WorkflowSlaNotificationReceipt,
  type WorkflowSlaNotificationSnapshot,
  type WorkflowSlaNotificationStore,
} from "./workflowSlaInternalNotification";

const now = "2026-10-18T15:00:00.000Z";
const input = {
  intentId: 44,
  organizationId: 9,
  expectedVersion: 1,
  workerId: "worker-a",
  leaseToken: "private-lease-token",
  operatorApproved: true,
};
const initial: WorkflowSlaNotificationSnapshot = {
  state: {
    intentId: 44,
    taskId: 71,
    organizationId: 9,
    eventKind: "overdue",
    scheduledAt: "2026-10-18T14:59:00.000Z",
    correlationId: "corr-44",
    status: "leased",
    version: 1,
    attempts: 1,
    leaseOwner: "worker-a",
    leaseToken: "private-lease-token",
    leaseExpiresAt: "2026-10-18T15:01:00.000Z",
    nextAttemptAt: null,
    deliveredAt: null,
    deadLetteredAt: null,
    lastFailureCode: null,
  },
  workflowVersionId: 101,
  nodeId: "review",
  taskActive: true,
};

// The DB boundary is replaced because this suite must not connect to MySQL.
// Serialize transactions, enforce CAS and roll back ALL effects on failure.
function fixture(clock: () => string = () => now) {
  let snapshot = structuredClone(initial);
  let receipt: WorkflowSlaNotificationReceipt | null = null;
  let audit: unknown[] = [];
  let failAudit = false;
  let loads = 0;
  let afterLoad = () => {};
  let afterCommit = () => {};
  let tail = Promise.resolve();
  const store: WorkflowSlaNotificationStore = {
    async transaction(callback) {
      const prior = tail;
      let unlock!: () => void;
      tail = new Promise<void>(resolve => {
        unlock = resolve;
      });
      await prior;
      const before = structuredClone({ snapshot, receipt, audit });
      try {
        return await callback({
          async loadForUpdate(scope) {
            loads += 1;
            afterLoad();
            return scope.organizationId === snapshot.state.organizationId &&
              scope.intentId === snapshot.state.intentId
              ? structuredClone(snapshot)
              : null;
          },
          async findReceipt() {
            return structuredClone(receipt);
          },
          async commit(change) {
            if (snapshot.state.version !== change.current.version)
              throw new Error("CAS conflict");
            snapshot.state = structuredClone(change.next);
            if (change.receipt) receipt = structuredClone(change.receipt);
            if (failAudit) throw new Error("audit unavailable");
            audit.push({
              organizationId: change.next.organizationId,
              action: change.reason,
              eventKey: change.eventKey,
              status: change.next.status,
              workerId: change.workerId,
            });
            afterCommit();
          },
        });
      } catch (error) {
        ({ snapshot, receipt, audit } = before);
        throw error;
      } finally {
        unlock();
      }
    },
  };
  return {
    service: createWorkflowSlaInternalNotificationService(store, clock),
    snapshot: () => snapshot,
    receipt: () => receipt,
    audit: () => audit,
    loads: () => loads,
    failAudit: () => {
      failAudit = true;
    },
    afterLoad: (fn: () => void) => {
      afterLoad = fn;
    },
    afterCommit: (fn: () => void) => {
      afterCommit = fn;
    },
    setReceipt: (value: WorkflowSlaNotificationReceipt | null) => {
      receipt = value;
    },
  };
}

beforeEach(() => {
  vi.stubEnv("AXE_RUNTIME_ENV", "homologation");
  vi.stubEnv("AXE_SLA_I5D_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("I5D — confirmação transacional da notificação interna", () => {
  it("aceita uma notificação com recibo estável, fencing e auditoria sem token", async () => {
    const f = fixture();
    expect(await f.service.confirm(input)).toEqual({
      outcome: "delivered",
      organizationId: 9,
      intentId: 44,
      eventKey: "workflow.sla.v1:9:71:overdue",
    });
    expect(f.receipt()).toEqual({
      organizationId: 9,
      intentId: 44,
      taskId: 71,
      workflowVersionId: 101,
      nodeId: "review",
      correlationId: "corr-44",
      eventKind: "overdue",
      eventKey: "workflow.sla.v1:9:71:overdue",
      scheduledAt: "2026-10-18T14:59:00.000Z",
      acceptedAt: now,
      deliveryVersion: 2,
    });
    expect(f.snapshot().state).toMatchObject({
      status: "delivered",
      version: 2,
      deliveredAt: now,
      leaseToken: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    expect(f.audit()).toHaveLength(1);
    expect(JSON.stringify([f.receipt(), f.audit()])).not.toContain(
      "private-lease-token"
    );
  });

  it("replay e confirmações concorrentes não duplicam recibo nem auditoria", async () => {
    const f = fixture();
    const results = await Promise.all([
      f.service.confirm(input),
      f.service.confirm(input),
    ]);
    expect(results.map(r => r.outcome)).toEqual(["delivered", "duplicate"]);
    expect((await f.service.confirm(input)).outcome).toBe("duplicate");
    expect(f.audit()).toHaveLength(1);
    expect(f.snapshot().state.version).toBe(2);
  });

  it("tarefa encerrada depois da descoberta é colocada em quarentena sem notificação", async () => {
    const f = fixture();
    f.snapshot().taskActive = false;
    expect((await f.service.confirm(input)).outcome).toBe("dead_lettered");
    expect(f.receipt()).toBeNull();
    expect(f.snapshot().state).toMatchObject({
      status: "dead_letter",
      version: 2,
      lastFailureCode: "permanent_rejection",
    });
    expect(f.audit()).toMatchObject([
      { action: "task_inactive", organizationId: 9 },
    ]);
  });

  it.each([
    { expectedVersion: 0 },
    { leaseToken: "old-token" },
    { workerId: "worker-b" },
  ])("rejeita confirmação obsoleta %j sem efeitos", async patch => {
    const f = fixture();
    await expect(f.service.confirm({ ...input, ...patch })).rejects.toThrow(
      /obsoleto/
    );
    expect(f.receipt()).toBeNull();
    expect(f.audit()).toEqual([]);
  });

  it("rejeita tenant cruzado e não revela a existência do registro", async () => {
    const f = fixture();
    await expect(
      f.service.confirm({ ...input, organizationId: 10 })
    ).rejects.toThrow(/escopo autorizado/);
    expect(f.snapshot()).toEqual(initial);
  });

  it("usa relógio após adquirir os locks; lease expirada durante espera não é aceita", async () => {
    const f = fixture();
    f.snapshot().state.leaseExpiresAt = now;
    await expect(f.service.confirm(input)).rejects.toThrow(/expirada/);
    expect(f.receipt()).toBeNull();
    expect(f.audit()).toEqual([]);
  });

  it("mede o relógio depois da espera pelo lock, sem reutilizar horário de início", async () => {
    let instant = now;
    const f = fixture(() => instant);
    f.afterLoad(() => {
      instant = "2026-10-18T15:01:00.000Z";
    });
    await expect(f.service.confirm(input)).rejects.toThrow(/expirada/);
    expect(f.snapshot()).toEqual(initial);
  });

  it("não confirma intenção que ainda não venceu mesmo com lease inconsistente", async () => {
    const f = fixture();
    f.snapshot().state.scheduledAt = "2026-10-18T15:00:01.000Z";
    await expect(f.service.confirm(input)).rejects.toThrow(/venceu/);
    expect(f.receipt()).toBeNull();
    expect(f.audit()).toEqual([]);
  });

  it.each(["2026-02-30T15:00:00.000Z", "2026-10-18T15:00:00-03:00"])(
    "relógio inválido %s impede gravação",
    async instant => {
      const f = fixture(() => instant);
      await expect(f.service.confirm(input)).rejects.toThrow(/UTC/);
      expect(f.snapshot()).toEqual(initial);
    }
  );

  it("falha de auditoria reverte recibo e confirmação juntos", async () => {
    const f = fixture();
    f.failAudit();
    await expect(f.service.confirm(input)).rejects.toThrow("audit unavailable");
    expect(f.snapshot()).toEqual(initial);
    expect(f.receipt()).toBeNull();
    expect(f.audit()).toEqual([]);
  });

  it("não infere entrega de status delivered sem recibo correspondente", async () => {
    const f = fixture();
    await f.service.confirm(input);
    f.setReceipt(null);
    await expect(f.service.confirm(input)).rejects.toThrow(/recibo/);
    expect(f.audit()).toHaveLength(1);
  });

  it("replay com recibo de outro snapshot falha fechado", async () => {
    const f = fixture();
    await f.service.confirm(input);
    f.setReceipt({ ...f.receipt()!, correlationId: "wrong-correlation" });
    await expect(f.service.confirm(input)).rejects.toThrow(/recibo/);
    expect(f.audit()).toHaveLength(1);
  });

  it.each([
    { intentId: 45 },
    { organizationId: 10 },
    { taskId: 72 },
    { workflowVersionId: 102 },
    { nodeId: "other-node" },
    { acceptedAt: "2026-10-18T14:59:59.000Z" },
    { deliveryVersion: 3 },
    { eventKey: "workflow.sla.v1:9:71:reminder" },
  ])("recibo divergente %j não é aceito como replay", async patch => {
    const f = fixture();
    await f.service.confirm(input);
    f.setReceipt({ ...f.receipt()!, ...patch });
    await expect(f.service.confirm(input)).rejects.toThrow(/recibo/);
    expect(f.audit()).toHaveLength(1);
  });

  it("fechamento posterior não apaga entrega já confirmada", async () => {
    const f = fixture();
    await f.service.confirm(input);
    f.snapshot().taskActive = false;
    expect((await f.service.confirm(input)).outcome).toBe("duplicate");
    expect(f.audit()).toHaveLength(1);
    expect(f.snapshot().state.status).toBe("delivered");
  });

  it.each([
    ["AXE_RUNTIME_ENV", "production"],
    ["AXE_SLA_I5D_ENABLED", "false"],
  ])("gate %s=%s bloqueia antes do banco", async (name, value) => {
    const f = fixture();
    vi.stubEnv(name, value);
    await expect(f.service.confirm(input)).rejects.toThrow(/desabilitad/);
    expect(f.loads()).toBe(0);
  });

  it("revalida gate depois dos locks antes de escrever", async () => {
    const f = fixture();
    f.afterLoad(() => {
      vi.stubEnv("AXE_SLA_I5D_ENABLED", "false");
    });
    await expect(f.service.confirm(input)).rejects.toThrow(/desabilitad/);
    expect(f.snapshot()).toEqual(initial);
  });

  it("desligamento durante commit causa rollback da transação inteira", async () => {
    const f = fixture();
    f.afterCommit(() => {
      vi.stubEnv("AXE_SLA_I5D_ENABLED", "false");
    });
    await expect(f.service.confirm(input)).rejects.toThrow(/desabilitad/);
    expect(f.snapshot()).toEqual(initial);
    expect(f.receipt()).toBeNull();
  });

  it.each([
    { intentId: 0 },
    { organizationId: 0 },
    { expectedVersion: -1 },
    { workerId: " " },
    { leaseToken: " " },
    { operatorApproved: false },
  ])("entrada inválida %j não acessa o banco", async patch => {
    const f = fixture();
    await expect(f.service.confirm({ ...input, ...patch })).rejects.toThrow();
    expect(f.loads()).toBe(0);
  });
});
