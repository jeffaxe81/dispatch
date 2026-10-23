import { describe, expect, it, vi } from "vitest";
import { createSlaAuditedFailoverCoordinator } from "./workflowSlaAuditedFailover";
import { signSlaFailoverApproval } from "./workflowSlaFailoverApproval";
import type { SlaFailoverStore } from "./workflowSlaHeartbeatMySql";

const secret = "approval-secret-j6g-".repeat(3);
const now = "2026-10-22T23:02:00.000Z";
const env = {
  NODE_ENV: "test", AXE_RUNTIME_ENV: "homologation", AXE_SLA_FAILOVER_ENABLED: "true",
};
const actor = {
  id: 11, openId: "admin-11", role: "admin" as const,
  operationalRole: "administrador" as const, teamId: null, active: true,
};
const approval = () => signSlaFailoverApproval({
  version: "j6g-v1", organizationId: 9, component: "scheduler",
  operatorUserId: 11, approverUserId: 22,
  approvalId: "12".repeat(16),
  issuedAt: "2026-10-22T23:00:00.000Z",
  expiresAt: "2026-10-22T23:04:00.000Z",
}, secret);
const payload = () => ({
  actor, organizationId: 9, component: "scheduler" as const,
  operatorApproved: true, approval: approval(),
});

function fixture() {
  const store: SlaFailoverStore = {
    accept: vi.fn(async () => false),
    read: vi.fn(async () => null),
    promote: vi.fn(async () => true),
  };
  const authorizeOperator = vi.fn(async () => {});
  const authorizeTenant = vi.fn(async () => {});
  const authorizeApprover = vi.fn(async () => {});
  const approvedSources = vi.fn(async () => ({
    expectedSourceId: "scheduler-a", nextSourceId: "scheduler-b",
  }));
  const openStore = vi.fn(async () => store);
  const deps = {
    environment: env, clock: () => now,
    approvalSecret: secret, authorizeOperator, authorizeTenant,
    authorizeApprover, approvedSources, openStore,
  };
  const make = () => createSlaAuditedFailoverCoordinator(deps);
  return { deps, store, authorizeOperator, authorizeTenant, authorizeApprover,
    approvedSources, openStore, make };
}

describe("J6G — operador autenticado, aprovação independente e auditoria atômica", () => {
  it("autoriza ambos administradores no tenant antes de abrir o banco", async () => {
    const f = fixture();
    expect(await f.make().transfer(payload())).toEqual({
      status: "fenced", organizationId: 9, component: "scheduler",
    });
    expect(f.authorizeOperator).toHaveBeenCalledWith(actor);
    expect(f.authorizeTenant).toHaveBeenCalledWith(actor, 9);
    expect(f.authorizeApprover).toHaveBeenCalledWith(22, 9);
    expect(f.openStore).toHaveBeenCalledOnce();
    expect(f.store.promote).toHaveBeenCalledWith({
      organizationId: 9, component: "scheduler",
      expectedSourceId: "scheduler-a", nextSourceId: "scheduler-b",
      nowMs: Date.parse(now),
      audit: {
        actorUserId: 11, approverUserId: 22,
        approvalRef: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
  });

  it("barra produção, user inativo, aprovação não assinada e autoaprovação ANTES de I/O", async () => {
    const f = fixture();
    for (const value of [
      { ...payload(), actor: { ...actor, active: false } },
      { ...payload(), operatorApproved: false },
      { ...payload(), approval: { ...approval(), signature: "0".repeat(64) } },
      { ...payload(), approval: { ...approval(), organizationId: 10 } },
      { ...payload(), component: "adapter" as const },
    ]) await expect(f.make().transfer(value)).rejects.toThrow();
    const forbidden = createSlaAuditedFailoverCoordinator({
      ...f.deps, environment: { ...env, NODE_ENV: "production" },
    });
    await expect(forbidden.transfer(payload())).rejects.toThrow(/não autorizada/i);
    expect(f.openStore).not.toHaveBeenCalled();
    expect(f.authorizeOperator).not.toHaveBeenCalled();
  });

  it("nega operador sem privilégio e aprovador ausente/fora do tenant sem abrir storage", async () => {
    const f = fixture();
    f.authorizeOperator.mockRejectedValueOnce(new Error("not superadmin"));
    await expect(f.make().transfer(payload())).rejects.toThrow("Transferência SLA não autorizada.");
    f.authorizeTenant.mockRejectedValueOnce(new Error("foreign tenant"));
    await expect(f.make().transfer(payload())).rejects.toThrow("Transferência SLA não autorizada.");
    f.authorizeApprover.mockRejectedValueOnce(new Error("inactive approver"));
    await expect(f.make().transfer(payload())).rejects.toThrow("Transferência SLA não autorizada.");
    expect(f.openStore).not.toHaveBeenCalled();
  });

  it("não revela erros SQL/segredos quando store não está disponível", async () => {
    const f = fixture();
    f.openStore.mockRejectedValueOnce(new Error("SQL password=secret"));
    await expect(f.make().transfer(payload())).rejects.toThrow("Transferência SLA não autorizada.");
    expect(f.store.promote).not.toHaveBeenCalled();
  });
});
