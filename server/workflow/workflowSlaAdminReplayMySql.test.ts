import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createWorkflowSlaAdminReplayService } from "./workflowSlaAdminReplay";
import { createWorkflowSlaAdminReplayMySqlStore } from "./workflowSlaAdminReplayMySql";
import { workflowSlaEventIntents } from "./workflowSlaEventIntentSchema";
import { workflowTasks } from "./workflowTaskSchema";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";

const input = {
  intentId: 44,
  organizationId: 9,
  actorUserId: 77,
  reason: "Falha externa corrigida",
  administratorApproved: true,
  now: "2026-10-20T18:45:00.000Z",
};

function fixture(options: {
  taskStatus?: string;
  scopeTenant?: number;
  affectedRows?: number;
  failAudit?: boolean;
} = {}) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const toArray = (
    table: Parameters<typeof getTableColumns>[0],
    values: Record<string, unknown>,
  ) => Object.keys(getTableColumns(table)).map(key => values[key] ?? null);

  const task = {
    id: 71,
    executionId: 81,
    workflowVersionId: 101,
    nodeId: "review",
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
    status: "dead_letter",
    deliveryVersion: 7,
    deliveryAttempts: 3,
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAtMs: null,
    nextAttemptAtMs: null,
    deliveredAtMs: null,
    deadLetteredAtMs: Date.parse("2026-10-18T15:05:00.000Z"),
    lastFailureCode: "unavailable",
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
          return [[toArray(workflowInstanceExecutions, {
            id: 81,
            workflowId: 12,
            workflowVersionId: 101,
            correlationId: "current-execution-correlation",
          })], []];
        if (/from `workflow_sla_event_intents`/.test(sql))
          return [[/select `task_id`/.test(sql)
            ? [71]
            : toArray(workflowSlaEventIntents, intent)], []];
        throw new Error(`Unexpected query ${sql}`);
      }
      if (options.failAudit && /^insert into `audit_logs`/.test(sql))
        throw new Error("audit offline");
      return [{ affectedRows: options.affectedRows ?? 1, insertId: 1 }, []];
    },
  };

  const db = drizzle({ client: client as never });
  return {
    service: createWorkflowSlaAdminReplayService(
      createWorkflowSlaAdminReplayMySqlStore(db),
    ),
    queries,
  };
}

describe("D-012I I5F — replay administrativo MySQL", () => {
  it("trava tenant/tarefa/intenção e grava CAS + auditoria na mesma transação", async () => {
    const f = fixture();
    expect(await f.service.replay(input)).toEqual({
      intentId: 44,
      organizationId: 9,
      status: "pending",
      version: 8,
    });
    expect(f.queries[0].sql).toBe("begin");
    expect(f.queries.at(-1)!.sql).toBe("commit");
    const locks = f.queries.filter(q => q.sql.includes("for update"));
    expect(locks.map(q => q.sql.match(/from `([^`]+)`/)![1])).toEqual([
      "workflow_tasks",
      "workflow_execution_tenant_scopes",
      "workflow_executions",
      "workflow_sla_event_intents",
    ]);
    const update = f.queries.find(q => /^update/.test(q.sql))!;
    expect(update.sql).toContain("`organization_id` = ?");
    expect(update.sql).toContain("`delivery_version` = ?");
    expect(update.sql).toContain("`status` = ?");
    expect(JSON.stringify(update)).toContain("dead_letter");
    const audit = f.queries.find(q => /^insert into `audit_logs`/.test(q.sql))!;
    expect(JSON.stringify(audit)).toContain("workflow_sla.admin_replay");
    expect(JSON.stringify(audit)).toContain("Falha externa corrigida");
    expect(JSON.stringify(audit)).toContain("77");
    expect(f.queries.some(q => /update `workflow_tasks`|update `incidents`|insert into `workflow_sla_notifications`/.test(q.sql))).toBe(false);
  });

  it.each(["completed", "cancelled"])("tarefa %s não pode ser reaberta pela DLQ", async taskStatus => {
    const f = fixture({ taskStatus });
    await expect(f.service.replay(input)).rejects.toThrow(/tarefa.*ativa/i);
    expect(f.queries.some(q => /^update|^insert/.test(q.sql))).toBe(false);
    expect(f.queries.at(-1)!.sql).toBe("rollback");
  });

  it("tenant divergente falha antes de UPDATE", async () => {
    const f = fixture({ scopeTenant: 10 });
    await expect(f.service.replay(input)).rejects.toThrow(/escopo/i);
    expect(f.queries.some(q => /^update|^insert/.test(q.sql))).toBe(false);
    expect(f.queries.at(-1)!.sql).toBe("rollback");
  });

  it("conflito CAS não registra auditoria nem sucesso aparente", async () => {
    const f = fixture({ affectedRows: 0 });
    await expect(f.service.replay(input)).rejects.toThrow(/outra transação|conflito/i);
    expect(f.queries.some(q => /^insert into `audit_logs`/.test(q.sql))).toBe(false);
    expect(f.queries.at(-1)!.sql).toBe("rollback");
  });

  it("falha de auditoria reverte a reabertura", async () => {
    const f = fixture({ failAudit: true });
    await expect(f.service.replay(input)).rejects.toThrow(/audit offline/);
    expect(f.queries.at(-1)!.sql).toBe("rollback");
    expect(f.queries.some(q => q.sql === "commit")).toBe(false);
  });
});
