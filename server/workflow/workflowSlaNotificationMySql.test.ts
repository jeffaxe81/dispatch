import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createWorkflowSlaInternalNotificationService } from "./workflowSlaInternalNotification";
import { createWorkflowSlaNotificationMySqlStore } from "./workflowSlaNotificationMySql";
import { workflowSlaEventIntents } from "./workflowSlaEventIntentSchema";
import { workflowTasks } from "./workflowTaskSchema";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";
import { workflowSlaNotifications } from "./workflowSlaNotificationSchema";

const now = "2026-10-18T15:00:00.000Z";
const input = {
  intentId: 44,
  organizationId: 9,
  workerId: "worker-a",
  leaseToken: "private-lease-token",
  expectedVersion: 1,
  operatorApproved: true,
};

// Only the mysql2 wire boundary is fake: real Drizzle builds SQL, maps rows,
// and drives begin/commit/rollback. Actual MySQL contention remains a release gate.
function fixture(
  options: {
    taskStatus?: string;
    scopeTenant?: number;
    nodeId?: string;
    affectedRows?: number;
    failAudit?: boolean;
    executionCorrelationId?: string;
    delivered?: boolean;
  } = {}
) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const toArray = (
    table: Parameters<typeof getTableColumns>[0],
    values: Record<string, unknown>
  ) => Object.keys(getTableColumns(table)).map(key => values[key] ?? null);
  const task = {
    id: 71,
    executionId: 81,
    workflowVersionId: 101,
    nodeId: options.nodeId ?? "review",
    status: options.taskStatus ?? "open",
    createdByUserId: 1,
  };
  const intent = {
    id: 44,
    taskId: 71,
    organizationId: 9,
    workflowVersionId: 101,
    nodeId: "review",
    correlationId: "corr-44",
    eventKind: "overdue",
    eventType: "workflow.task.sla.overdue.v1",
    escalationMode: "notify_only",
    scheduledAt: "2026-10-18 14:59:00",
    status: options.delivered ? "delivered" : "leased",
    deliveryVersion: options.delivered ? 2 : 1,
    deliveryAttempts: 1,
    leaseOwner: options.delivered ? null : "worker-a",
    leaseToken: options.delivered ? null : "private-lease-token",
    leaseExpiresAtMs: options.delivered
      ? null
      : Date.parse("2026-10-18T15:01:00.000Z"),
    deliveredAtMs: options.delivered ? Date.parse(now) : null,
  };
  const client = {
    async query(query: { sql: string }, params: unknown[] = []) {
      queries.push({ sql: query.sql, params });
      const sql = query.sql;
      if (/^select/.test(sql)) {
        if (/from `workflow_tasks`/.test(sql))
          return [[toArray(workflowTasks, task)], []];
        if (/from `workflow_execution_tenant_scopes`/.test(sql))
          return [[[options.scopeTenant ?? 9]], []];
        if (/from `workflow_executions`/.test(sql))
          return [
            [
              toArray(workflowInstanceExecutions, {
                id: 81,
                workflowId: 12,
                workflowVersionId: 101,
                correlationId: options.executionCorrelationId ?? "corr-44",
              }),
            ],
            [],
          ];
        if (/from `workflow_sla_event_intents`/.test(sql)) {
          return [
            [
              /select `task_id`/.test(sql)
                ? [71]
                : toArray(workflowSlaEventIntents, intent),
            ],
            [],
          ];
        }
        if (/from `workflow_sla_notifications`/.test(sql))
          return [
            options.delivered
              ? [
                  toArray(workflowSlaNotifications, {
                    id: 1,
                    intentId: 44,
                    organizationId: 9,
                    taskId: 71,
                    workflowVersionId: 101,
                    nodeId: "review",
                    correlationId: "corr-44",
                    eventKind: "overdue",
                    eventKey: "workflow.sla.v1:9:71:overdue",
                    deliveryVersion: 2,
                    scheduledAtMs: Date.parse("2026-10-18T14:59:00.000Z"),
                    acceptedAtMs: Date.parse(now),
                  }),
                ]
              : [],
            [],
          ];
        throw new Error(`Unexpected query ${sql}`);
      }
      if (options.failAudit && /^insert into `audit_logs`/.test(sql))
        throw new Error("audit offline");
      return [{ affectedRows: options.affectedRows ?? 1, insertId: 1 }, []];
    },
  };
  const db = drizzle({ client: client as never });
  const service = createWorkflowSlaInternalNotificationService(
    createWorkflowSlaNotificationMySqlStore(db),
    () => now
  );
  return { service, queries };
}

beforeEach(() => {
  vi.stubEnv("AXE_RUNTIME_ENV", "homologation");
  vi.stubEnv("AXE_SLA_I5D_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("I5D — notificação e recibo MySQL na mesma transação", () => {
  it("trava tarefa e tenant antes da intenção; confirma recibo, CAS e auditoria antes de commit", async () => {
    const f = fixture();
    expect((await f.service.confirm(input)).outcome).toBe("delivered");
    const { queries } = f;
    expect(queries[0].sql).toBe("begin");
    expect(queries.at(-1)!.sql).toBe("commit");
    const locks = queries.filter(q => q.sql.includes("for update"));
    expect(locks.map(q => q.sql.match(/from `([^`]+)`/)![1])).toEqual([
      "workflow_tasks",
      "workflow_execution_tenant_scopes",
      "workflow_executions",
      "workflow_sla_event_intents",
      "workflow_sla_notifications",
    ]);
    expect(queries.find(q => /select `task_id`/.test(q.sql))?.params).toEqual([
      44, 9, 1,
    ]);
    const update = queries.find(q => /^update/.test(q.sql))!;
    expect(update.sql).toContain("`delivery_version` = ?");
    expect(update.sql).toContain("`organization_id` = ?");
    expect(update.sql).toContain("`lease_token` = ?");
    expect(update.sql).toContain("`lease_owner` = ?");
    const inserts = queries.filter(q => /^insert/.test(q.sql));
    expect(inserts.map(q => q.sql.match(/into `([^`]+)`/)![1])).toEqual([
      "workflow_sla_notifications",
      "audit_logs",
    ]);
    expect(JSON.stringify(inserts)).toContain("workflow.sla.v1:9:71:overdue");
    expect(JSON.stringify(inserts)).not.toContain("private-lease-token");
    expect(
      queries.some(q =>
        /update `workflow_tasks`|update `incidents`/.test(q.sql)
      )
    ).toBe(false);
  });

  it.each(["completed", "cancelled"])(
    "tarefa %s não gera notificação interna",
    async taskStatus => {
      const f = fixture({ taskStatus });
      expect((await f.service.confirm(input)).outcome).toBe("dead_lettered");
      expect(
        f.queries.some(q =>
          /^insert into `workflow_sla_notifications`/.test(q.sql)
        )
      ).toBe(false);
      expect(f.queries.at(-1)!.sql).toBe("commit");
    }
  );

  it("cancelamento com nova correlação preserva a intenção original e permite quarentena", async () => {
    const f = fixture({
      taskStatus: "cancelled",
      executionCorrelationId: "cancel-request-correlation",
    });
    expect((await f.service.confirm(input)).outcome).toBe("dead_lettered");
    const audit = f.queries.find(q => /^insert into `audit_logs`/.test(q.sql));
    expect(JSON.stringify(audit)).toContain("corr-44");
    expect(JSON.stringify(audit)).not.toContain("cancel-request-correlation");
    expect(
      f.queries.some(q =>
        /^insert into `workflow_sla_notifications`/.test(q.sql)
      )
    ).toBe(false);
  });

  it("retomada com nova correlação não invalida replay de um recibo já confirmado", async () => {
    const f = fixture({
      delivered: true,
      taskStatus: "completed",
      executionCorrelationId: "resume-request-correlation",
    });
    expect((await f.service.confirm(input)).outcome).toBe("duplicate");
    expect(f.queries.some(q => /^insert|^update/.test(q.sql))).toBe(false);
    expect(f.queries.at(-1)!.sql).toBe("commit");
  });

  it.each([{ scopeTenant: 10 }, { nodeId: "changed-node" }])(
    "snapshot divergente %j falha antes de UPDATE",
    async options => {
      const f = fixture(options);
      await expect(f.service.confirm(input)).rejects.toThrow();
      expect(f.queries.some(q => /^update|^insert/.test(q.sql))).toBe(false);
      expect(f.queries.at(-1)!.sql).toBe("rollback");
    }
  );

  it("CAS sem affectedRows não insere recibo nem confirma entrega", async () => {
    const f = fixture({ affectedRows: 0 });
    await expect(f.service.confirm(input)).rejects.toThrow(/outra transação/);
    expect(f.queries.some(q => /^insert/.test(q.sql))).toBe(false);
    expect(f.queries.at(-1)!.sql).toBe("rollback");
  });

  it("falha na auditoria solicita rollback de toda a entrega", async () => {
    const f = fixture({ failAudit: true });
    await expect(f.service.confirm(input)).rejects.toThrow();
    expect(f.queries.at(-1)!.sql).toBe("rollback");
    expect(f.queries.some(q => q.sql === "commit")).toBe(false);
  });
});
