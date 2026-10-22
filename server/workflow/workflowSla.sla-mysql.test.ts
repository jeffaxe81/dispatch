import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { createConnection, type Connection } from "mysql2/promise";
import type { QueryOptions, ResultSetHeader, RowDataPacket } from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import {
  assertEmptySlaMysqlDatabase,
  getSlaMysqlTestSettings,
} from "../test/slaMysqlEnvironment";
import {
  createWorkflowSlaDeliveryCoordinator,
  WorkflowSlaDeliveryConflictError,
} from "./workflowSlaDeliveryCoordinator";
import { createWorkflowSlaMySqlDeliveryStorage } from "./workflowSlaDeliveryMySql";
import { createWorkflowSlaInternalNotificationService } from "./workflowSlaInternalNotification";
import { createWorkflowSlaNotificationMySqlStore } from "./workflowSlaNotificationMySql";
import { createWorkflowSlaOperationalMetricsMySql } from "./workflowSlaOperationalMetricsMySql";

const now = "2026-10-18T18:00:00.000Z";
const nowMs = Date.parse(now);
const policy = {
  maxAttempts: 3,
  leaseDurationMs: 60_000,
  baseRetryMs: 5_000,
  maxRetryMs: 30_000,
};
const settings = getSlaMysqlTestSettings(process.env);
const connections = new Set<Connection>();
let control: Connection;
let userId: number;
let tenantA: number;
let tenantB: number;
let workflowId: number;
let workflowVersionId: number;

type Fixture = {
  intentId: number;
  taskId: number;
  executionId: number;
  correlationId: string;
};
type Input = {
  intentId: number;
  organizationId: number;
  expectedVersion: number;
  workerId: string;
  leaseToken: string;
  operatorApproved: boolean;
};
type QueryObserver = (sql: string, result: unknown) => void | Promise<void>;

function mysqlErrorCode(error: unknown): string | undefined {
  const seen = new Set<object>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const item = error as { code?: unknown; cause?: unknown };
    if (typeof item.code === "string") return item.code;
    error = item.cause;
  }
  return undefined;
}

function errorMessages(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<object>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const item = error as { message?: unknown; cause?: unknown };
    if (typeof item.message === "string") messages.push(item.message);
    error = item.cause;
  }
  return messages.join("\n");
}

async function expectMysqlRejection(promise: Promise<unknown>, code: string) {
  const [result] = await Promise.allSettled([promise]);
  expect(result.status).toBe("rejected");
  if (result.status === "rejected")
    expect(mysqlErrorCode(result.reason)).toBe(code);
}

async function connection() {
  const client = await createConnection(settings);
  connections.add(client);
  await client.query("SET SESSION time_zone = '+00:00'");
  await client.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await client.query("SET SESSION innodb_lock_wait_timeout = 3");
  return client;
}

/** Every query reaches the REAL mysql2 connection. Hooks only observe/pause after real results. */
function database(client: Connection, afterQuery?: QueryObserver) {
  if (!afterQuery) return drizzle({ client });
  const observed = new Proxy(client, {
    get(target, property) {
      if (property === "query")
        return async (query: string | QueryOptions, values?: unknown[]) => {
          const result = await target.query(query as QueryOptions, values);
          await afterQuery(
            typeof query === "string" ? query : query.sql,
            result
          );
          return result;
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return drizzle({ client: observed });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

async function deadline(promise: Promise<unknown>, stage: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Barreira MySQL não atingida: ${stage}`)),
          5_000
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function observeTaskLockWait(threadId: number): Promise<number> {
  const until = Date.now() + 5_000;
  while (Date.now() < until) {
    // SHOW FULL PROCESSLIST exposes this user's own connections without extra grants.
    const [rows] = await control.query<RowDataPacket[]>(
      "SHOW FULL PROCESSLIST"
    );
    const waiting = rows.find(
      row =>
        Number(row.Id) === threadId &&
        row.Command === "Query" &&
        String(row.Info ?? "")
          .toLowerCase()
          .includes("from `workflow_tasks`") &&
        String(row.Info ?? "")
          .toLowerCase()
          .includes("for update") &&
        Number(row.Time) >= 1
    );
    if (waiting) return Number(waiting.Time);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(
    "Contendor não observado no servidor esperando o lock de tarefa."
  );
}

function barrier(parties: number) {
  const ready = deferred();
  const release = deferred();
  let arrived = 0;
  return {
    ready,
    release,
    tap: () => {
      let observed = false;
      return async (sql: string) => {
        if (
          observed ||
          !sql.startsWith("select ") ||
          !sql.includes("from `workflow_sla_event_intents`")
        )
          return;
        observed = true;
        if (++arrived === parties) ready.resolve();
        await release.promise;
      };
    },
  };
}

async function insert(sql: string, values: (string | number | Date | null)[]) {
  const [result] = await control.execute<ResultSetHeader>(sql, values);
  expect(result.insertId).toBeGreaterThan(0);
  return result.insertId;
}

async function seed(): Promise<Fixture> {
  const executionId = await insert(
    "INSERT INTO workflow_executions (workflow_id, workflow_version_id, current_node_id, correlation_id, workflow_execution_status) VALUES (?, ?, 'review', ?, 'em_execucao')",
    [workflowId, workflowVersionId, randomUUID()]
  );
  const correlationId = `sla-execution-${executionId}`;
  await control.execute(
    "UPDATE workflow_executions SET correlation_id = ? WHERE id = ?",
    [correlationId, executionId]
  );
  await control.execute(
    "INSERT INTO workflow_execution_tenant_scopes (execution_id, organization_id) VALUES (?, ?)",
    [executionId, tenantA]
  );
  const taskId = await insert(
    "INSERT INTO workflow_tasks (execution_id, workflow_version_id, node_id, status, created_by_user_id) VALUES (?, ?, 'review', 'open', ?)",
    [executionId, workflowVersionId, userId]
  );
  const intentId = await insert(
    "INSERT INTO workflow_sla_event_intents (task_id, organization_id, workflow_version_id, node_id, correlation_id, event_kind, event_type, escalation_mode, scheduled_at) VALUES (?, ?, ?, 'review', ?, 'overdue', 'workflow.task.sla.overdue.v1', 'notify_only', ?)",
    [
      taskId,
      tenantA,
      workflowVersionId,
      correlationId,
      new Date(nowMs - 60_000),
    ]
  );
  return { intentId, taskId, executionId, correlationId };
}

function coordinator(client: Connection, tap?: QueryObserver) {
  return createWorkflowSlaDeliveryCoordinator(
    createWorkflowSlaMySqlDeliveryStorage(database(client, tap)),
    policy
  );
}
function service(client: Connection, tap?: QueryObserver, clock = () => now) {
  return createWorkflowSlaInternalNotificationService(
    createWorkflowSlaNotificationMySqlStore(database(client, tap)),
    clock
  );
}

async function claim(fixture: Fixture, client = control): Promise<Input> {
  const workerId = "mysql-homologation-worker";
  const leaseToken = randomUUID();
  const result = await coordinator(client).transition({
    intentId: fixture.intentId,
    action: {
      type: "claim",
      organizationId: tenantA,
      workerId,
      leaseToken,
      now,
    },
  });
  expect(result.outcome).toBe("claimed");
  return {
    intentId: fixture.intentId,
    organizationId: tenantA,
    expectedVersion: result.state.version,
    workerId,
    leaseToken,
    operatorApproved: true,
  };
}

async function facts(fixture: Fixture) {
  const [states] = await control.execute<RowDataPacket[]>(
    "SELECT status, delivery_version AS version, delivery_attempts AS attempts, lease_token AS leaseToken FROM workflow_sla_event_intents WHERE id = ?",
    [fixture.intentId]
  );
  const [receipts] = await control.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM workflow_sla_notifications WHERE intent_id = ?",
    [fixture.intentId]
  );
  const [audit] = await control.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM audit_logs WHERE resource_type = 'workflow_sla_intent' AND resource_id = ?",
    [fixture.intentId]
  );
  const [tasks] = await control.execute<RowDataPacket[]>(
    "SELECT status FROM workflow_tasks WHERE id = ?",
    [fixture.taskId]
  );
  return {
    ...states[0],
    receipts: Number(receipts[0].n),
    audits: Number(audit[0].n),
    taskStatus: tasks[0]?.status,
  };
}

beforeAll(async () => {
  control = await connection();
  const [context] = await control.query<RowDataPacket[]>(
    "SELECT DATABASE() AS db, VERSION() AS version"
  );
  const [tables] = await control.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()"
  );
  assertEmptySlaMysqlDatabase(context[0].db, Number(tables[0].n));
  expect(context[0].version).toMatch(/^8\.4\./);
  // Apply the REAL ordered journal, including 0014–0017, to this empty disposable schema only.
  await migrate(database(control), { migrationsFolder: "drizzle" });
  userId = await insert(
    "INSERT INTO users (openId, name) VALUES ('sla-homologation-user', 'SLA test fixture')",
    []
  );
  tenantA = await insert(
    "INSERT INTO organizations (code, name) VALUES ('sla-a', 'SLA tenant A')",
    []
  );
  tenantB = await insert(
    "INSERT INTO organizations (code, name) VALUES ('sla-b', 'SLA tenant B')",
    []
  );
  workflowId = await insert(
    "INSERT INTO workflows (name, created_by_user_id) VALUES ('SLA disposable fixture', ?)",
    [userId]
  );
  workflowVersionId = await insert(
    "INSERT INTO workflow_versions (workflow_id, version, definition, created_by_user_id) VALUES (?, 1, ?, ?)",
    [
      workflowId,
      JSON.stringify({ nodes: [{ id: "review", type: "task" }] }),
      userId,
    ]
  );
  await control.execute(
    "INSERT INTO workflow_tenant_scopes (workflow_id, organization_id) VALUES (?, ?)",
    [workflowId, tenantA]
  );
});

beforeEach(() => {
  vi.stubEnv("AXE_RUNTIME_ENV", "homologation");
  vi.stubEnv("AXE_SLA_I5D_ENABLED", "true");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const client of [...connections]) {
    if (client === control) continue;
    await client.rollback().catch(() => {});
    await client.end().catch(() => {});
    connections.delete(client);
  }
});
afterAll(async () => {
  for (const client of connections) await client.end().catch(() => {});
  connections.clear();
});

describe("I5E — MySQL 8.4 físico, CAS e transações concorrentes", () => {
  it("confirma conexões físicas distintas, REPEATABLE READ, UTC e recusa schema já usado", async () => {
    const a = await connection();
    const b = await connection();
    const read = async (c: Connection) =>
      (
        await c.query<RowDataPacket[]>(
          "SELECT CONNECTION_ID() AS id, @@transaction_isolation AS isolationLevel, @@session.time_zone AS timeZone"
        )
      )[0][0];
    const info = await Promise.all([read(control), read(a), read(b)]);
    expect(new Set(info.map(row => row.id)).size).toBe(3);
    expect(
      info.every(
        row =>
          row.isolationLevel === "REPEATABLE-READ" && row.timeZone === "+00:00"
      )
    ).toBe(true);
    const [tables] = await control.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()"
    );
    expect(() =>
      assertEmptySlaMysqlDatabase(
        "dispatch_sla_homologation",
        Number(tables[0].n)
      )
    ).toThrow(/vazio/);
    console.info(
      `SLA MySQL: 3 conexões físicas distintas; REPEATABLE READ; sessão UTC; migrations 0014–0017 aplicadas.`
    );
  });

  it("dois claims que leram a mesma versão têm exatamente um vencedor CAS", async () => {
    const fixture = await seed();
    const a = await connection();
    const b = await connection();
    const gate = barrier(2);
    const attempt = (c: Connection, workerId: string) =>
      coordinator(c, gate.tap()).transition({
        intentId: fixture.intentId,
        action: {
          type: "claim",
          organizationId: tenantA,
          now,
          workerId,
          leaseToken: randomUUID(),
        },
      });
    const pending = [attempt(a, "worker-a"), attempt(b, "worker-b")];
    const resultsPromise = Promise.allSettled(pending);
    try {
      await deadline(
        gate.ready.promise,
        "ambos os claims leram delivery_version=0"
      );
    } finally {
      gate.release.resolve();
    }
    const results = await resultsPromise;
    expect(
      results.filter(result => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(
      1
    );
    const conflict = results.find(result => result.status === "rejected");
    if (conflict?.status === "rejected")
      expect(conflict.reason).toBeInstanceOf(WorkflowSlaDeliveryConflictError);
    expect(await facts(fixture)).toMatchObject({
      status: "leased",
      version: 1,
      attempts: 1,
      receipts: 0,
      audits: 0,
    });
  });

  it("dois workers com snapshot antigo confirmam um único recibo sob REPEATABLE READ", async () => {
    const fixture = await seed();
    const input = await claim(fixture);
    const a = await connection();
    const b = await connection();
    const gate = barrier(2);
    const pending = [
      service(a, gate.tap()).confirm(input),
      service(b, gate.tap()).confirm(input),
    ];
    const resultsPromise = Promise.all(pending);
    try {
      await deadline(
        gate.ready.promise,
        "ambos leram o ponteiro antes do primeiro commit"
      );
    } finally {
      gate.release.resolve();
    }
    expect((await resultsPromise).map(result => result.outcome).sort()).toEqual(
      ["delivered", "duplicate"]
    );
    expect((await service(b).confirm(input)).outcome).toBe("duplicate");
    expect(await facts(fixture)).toMatchObject({
      status: "delivered",
      version: 2,
      receipts: 1,
      audits: 1,
      leaseToken: null,
    });
  });

  it("encerramento entre descoberta e lock provoca quarentena sem notificação", async () => {
    const fixture = await seed();
    const input = await claim(fixture);
    const a = await connection();
    const b = await connection();
    const gate = barrier(1);
    const pending = service(b, gate.tap()).confirm(input);
    try {
      await deadline(
        gate.ready.promise,
        "ponteiro descoberto sem bloquear tarefa"
      );
      await a.beginTransaction();
      await a.execute(
        "UPDATE workflow_tasks SET status = 'completed' WHERE id = ?",
        [fixture.taskId]
      );
      await a.execute(
        "UPDATE workflow_executions SET correlation_id = 'completion-new-correlation' WHERE id = ?",
        [fixture.executionId]
      );
      await a.commit();
    } finally {
      gate.release.resolve();
    }
    expect((await pending).outcome).toBe("dead_lettered");
    expect(await facts(fixture)).toMatchObject({
      status: "dead_letter",
      receipts: 0,
      audits: 1,
      taskStatus: "completed",
    });
  });

  it("tenant diferente e fencing obsoleto não escrevem recibo ou auditoria", async () => {
    const fixture = await seed();
    const input = await claim(fixture);
    const worker = service(await connection());
    await expect(
      worker.confirm({ ...input, organizationId: tenantB })
    ).rejects.toThrow(/escopo autorizado/);
    await expect(
      worker.confirm({ ...input, leaseToken: "obsolete" })
    ).rejects.toThrow(/obsolet/);
    await expect(
      worker.confirm({ ...input, expectedVersion: 0 })
    ).rejects.toThrow(/obsolet/);
    expect(await facts(fixture)).toMatchObject({
      status: "leased",
      version: 1,
      receipts: 0,
      audits: 0,
    });
  });

  it("lease expirada durante espera pelo lock não é confirmada", async () => {
    const fixture = await seed();
    const input = await claim(fixture);
    const owner = await connection();
    const contender = await connection();
    await owner.beginTransaction();
    await owner.execute(
      "SELECT id FROM workflow_tasks WHERE id = ? FOR UPDATE",
      [fixture.taskId]
    );
    await contender.query("SET SESSION innodb_lock_wait_timeout = 10");
    const [ids] = await contender.query<RowDataPacket[]>(
      "SELECT CONNECTION_ID() AS id"
    );
    let clock = now;
    const pending = service(contender, undefined, () => clock).confirm(input);
    const result = Promise.allSettled([pending]);
    try {
      const observedSeconds = await observeTaskLockWait(Number(ids[0].id));
      expect(observedSeconds).toBeGreaterThanOrEqual(1);
      clock = "2026-10-18T18:01:00.000Z";
    } finally {
      await owner.commit();
    }
    const outcome = (await result)[0];
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected")
      expect(String(outcome.reason)).toMatch(/expirada/);
    expect(await facts(fixture)).toMatchObject({
      status: "leased",
      version: 1,
      receipts: 0,
      audits: 0,
    });
  });

  it("falha SQL real na auditoria reverte CAS e recibo juntos", async () => {
    const fixture = await seed();
    const input = await claim(fixture);
    const constraint = `sla_test_audit_${fixture.intentId}`;
    await control.query(
      `ALTER TABLE audit_logs ADD CONSTRAINT ${constraint} CHECK (resource_type <> 'workflow_sla_intent' OR resource_id <> ${fixture.intentId})`
    );
    try {
      await expectMysqlRejection(
        service(await connection()).confirm(input),
        "ER_CHECK_CONSTRAINT_VIOLATED"
      );
    } finally {
      await control.query(`ALTER TABLE audit_logs DROP CHECK ${constraint}`);
    }
    expect(await facts(fixture)).toMatchObject({
      status: "leased",
      version: 1,
      receipts: 0,
      audits: 0,
      leaseToken: input.leaseToken,
    });
  });

  it("desligamento após as escritas provoca rollback real da transação inteira", async () => {
    const fixture = await seed();
    const input = await claim(fixture);
    const tap = (sql: string) => {
      if (sql.startsWith("insert into `audit_logs`"))
        vi.stubEnv("AXE_SLA_I5D_ENABLED", "false");
    };
    await expect(
      service(await connection(), tap).confirm(input)
    ).rejects.toThrow(/desabilitad/);
    expect(await facts(fixture)).toMatchObject({
      status: "leased",
      version: 1,
      receipts: 0,
      audits: 0,
    });
  });

  it("perda da conexão depois do CAS não deixa confirmação parcial", async () => {
    const fixture = await seed();
    const input = await claim(fixture);
    const client = await connection();
    let destroyedAfterSuccessfulCas = false;
    const tap: QueryObserver = (sql, result) => {
      if (sql.startsWith("update `workflow_sla_event_intents`")) {
        const [header] = result as [ResultSetHeader, unknown];
        expect(header.affectedRows).toBe(1);
        destroyedAfterSuccessfulCas = true;
        client.destroy();
      }
    };
    const [outcome] = await Promise.allSettled([
      service(client, tap).confirm(input),
    ]);
    expect(destroyedAfterSuccessfulCas).toBe(true);
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected")
      expect(errorMessages(outcome.reason)).toMatch(
        /connection.*closed state/i
      );
    // A locking read waits for server-side rollback of the disconnected transaction.
    await control.execute(
      "SELECT id FROM workflow_sla_event_intents WHERE id = ? FOR UPDATE",
      [fixture.intentId]
    );
    expect(await facts(fixture)).toMatchObject({
      status: "leased",
      version: 1,
      receipts: 0,
      audits: 0,
    });
  });

  it("deadlock entre cancelamento e confirmação falha sem efeitos parciais", async () => {
    const fixture = await seed();
    const input = await claim(fixture);
    const canceller = await connection();
    const notifier = await connection();
    await canceller.beginTransaction();
    await canceller.execute(
      "SELECT id FROM workflow_executions WHERE id = ? FOR UPDATE",
      [fixture.executionId]
    );
    const taskLocked = deferred();
    const notification = service(notifier, sql => {
      if (sql.includes("from `workflow_tasks`") && sql.includes("for update"))
        taskLocked.resolve();
    }).confirm(input);
    const notificationResult = Promise.allSettled([notification]);
    await deadline(
      taskLocked.promise,
      "notificador bloqueou tarefa antes de pedir execução"
    );
    const cancellation = (async () => {
      try {
        await canceller.execute(
          "UPDATE workflow_tasks SET status = 'cancelled' WHERE id = ?",
          [fixture.taskId]
        );
        await canceller.commit();
        return "cancelled";
      } catch (error) {
        await canceller.rollback();
        throw error;
      }
    })();
    const cancellationResult = await Promise.allSettled([cancellation]);
    const [n] = await notificationResult;
    const [c] = cancellationResult;
    expect([n, c].filter(result => result.status === "rejected")).toHaveLength(
      1
    );
    const victim = [n, c].find(result => result.status === "rejected");
    if (victim?.status === "rejected")
      expect(mysqlErrorCode(victim.reason)).toBe("ER_LOCK_DEADLOCK");
    const state = await facts(fixture);
    if (n.status === "fulfilled") {
      expect(n.value.outcome).toBe("delivered");
      expect(state).toMatchObject({
        status: "delivered",
        receipts: 1,
        audits: 1,
        taskStatus: "open",
      });
    } else {
      expect(c.status).toBe("fulfilled");
      expect(state).toMatchObject({
        status: "leased",
        version: 1,
        receipts: 0,
        audits: 0,
        taskStatus: "cancelled",
      });
    }
  });

  it("índices únicos e FK RESTRICT preservam o recibo aceito", async () => {
    const fixture = await seed();
    const input = await claim(fixture);
    await service(await connection()).confirm(input);
    await expectMysqlRejection(
      control.execute(
        "INSERT INTO workflow_sla_notifications (intent_id, organization_id, task_id, workflow_version_id, node_id, correlation_id, event_kind, event_key, scheduled_at_ms, accepted_at_ms, delivery_version) SELECT intent_id, organization_id, task_id, workflow_version_id, node_id, correlation_id, event_kind, event_key, scheduled_at_ms, accepted_at_ms, delivery_version FROM workflow_sla_notifications WHERE intent_id = ?",
        [fixture.intentId]
      ),
      "ER_DUP_ENTRY"
    );
    await expectMysqlRejection(
      control.execute("DELETE FROM workflow_tasks WHERE id = ?", [
        fixture.taskId,
      ]),
      "ER_ROW_IS_REFERENCED_2"
    );
    expect(await facts(fixture)).toMatchObject({
      status: "delivered",
      receipts: 1,
      audits: 1,
      taskStatus: "open",
    });
  });

  it("epoch-ms e correlação congelada sobrevivem ao roundtrip e retomada", async () => {
    const fixture = await seed();
    const input = await claim(fixture);
    const worker = service(await connection());
    await worker.confirm(input);
    const [rows] = await control.execute<RowDataPacket[]>(
      "SELECT scheduled_at_ms, accepted_at_ms, correlation_id FROM workflow_sla_notifications WHERE intent_id = ?",
      [fixture.intentId]
    );
    expect(Number(rows[0].scheduled_at_ms)).toBe(nowMs - 60_000);
    expect(Number(rows[0].accepted_at_ms)).toBe(nowMs);
    expect(rows[0].correlation_id).toBe(fixture.correlationId);
    await control.execute(
      "UPDATE workflow_tasks SET status = 'completed' WHERE id = ?",
      [fixture.taskId]
    );
    await control.execute(
      "UPDATE workflow_executions SET correlation_id = 'resume-new-correlation' WHERE id = ?",
      [fixture.executionId]
    );
    expect((await worker.confirm(input)).outcome).toBe("duplicate");
    await control.execute(
      "UPDATE workflow_sla_notifications SET correlation_id = 'tampered-receipt' WHERE intent_id = ?",
      [fixture.intentId]
    );
    await expect(worker.confirm(input)).rejects.toThrow(/recibo/);
    expect(await facts(fixture)).toMatchObject({
      status: "delivered",
      receipts: 1,
      audits: 1,
    });
  });
  it("J6B: agregação real sem LIMIT respeita organização e escopo de execução", async () => {
    const metrics = createWorkflowSlaOperationalMetricsMySql(database(control));
    const tenantBefore = await metrics.summarize({ organizationId: tenantA, now });
    const otherBefore = await metrics.summarize({ organizationId: tenantB, now });
    const fixture = await seed();
    const afterSeed = await metrics.summarize({ organizationId: tenantA, now });
    expect(afterSeed.pending).toBe(tenantBefore.pending + 1);
    expect(afterSeed.overdue).toBe(tenantBefore.overdue + 1);
    expect(afterSeed.generatedAt).toBe(now);
    expect(await metrics.summarize({ organizationId: tenantB, now })).toEqual(otherBefore);

    // Even if intent metadata is accidentally mislabeled, execution scope wins.
    await control.execute(
      "UPDATE workflow_sla_event_intents SET organization_id = ? WHERE id = ?",
      [tenantB, fixture.intentId]
    );
    const afterMismatch = await metrics.summarize({ organizationId: tenantA, now });
    expect(afterMismatch.pending).toBe(tenantBefore.pending);
    expect(await metrics.summarize({ organizationId: tenantB, now })).toEqual(otherBefore);
  });

});
