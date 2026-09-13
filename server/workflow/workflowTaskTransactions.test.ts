import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, users } from "../../drizzle/schema";
import { setDbForTesting } from "../dbLegacy";
import { workflowTaskEvents, workflowTasks } from "./workflowTaskSchema";
import { claimWorkflowTask, startWorkflowTask } from "./workflowTaskPersistence";

type TaskRow = {
  id: number;
  executionId: number;
  nodeId: string;
  status: "open" | "in_progress" | "completed" | "cancelled";
  assignmentType: "user" | "team" | "role";
  assigneeUserId: number | null;
  assigneeTeamId: number | null;
  assigneeRole: string | null;
  claimedByUserId: number | null;
  correlationId: string;
  claimedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
};

type UserRow = {
  id: number;
  active: boolean;
  teamId: number | null;
  operationalRole: "operador" | "despachador" | "agente" | "supervisor" | "administrador";
};

function conditionContainsNumber(value: unknown, expected: number, visited = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (visited.has(value as object)) return false;
  visited.add(value as object);
  if ((value as { value?: unknown }).value === expected) return true;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(nested) && nested.some(item => conditionContainsNumber(item, expected, visited))) return true;
    if (nested && typeof nested === "object" && conditionContainsNumber(nested, expected, visited)) return true;
  }
  return false;
}

function createHarness(input?: { task?: Partial<TaskRow>; user?: Partial<UserRow> }) {
  const task: TaskRow = {
    id: 1,
    executionId: 10,
    nodeId: "task-1",
    status: "open",
    assignmentType: "user",
    assigneeUserId: 7,
    assigneeTeamId: null,
    assigneeRole: null,
    claimedByUserId: null,
    correlationId: "corr-created",
    claimedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    ...input?.task,
  };
  const user: UserRow = {
    id: 7,
    active: true,
    teamId: 20,
    operationalRole: "operador",
    ...input?.user,
  };
  const events: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  let taskLocks = 0;

  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => ({
          limit: (_count: number) => {
            if (table === workflowTasks) {
              return {
                for: async (mode: string) => {
                  if (mode === "update") taskLocks += 1;
                  return conditionContainsNumber(condition, task.id) ? [task] : [];
                },
              };
            }
            if (table === users) {
              return Promise.resolve(conditionContainsNumber(condition, user.id) ? [user] : []);
            }
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (condition: unknown) => {
          if (table === workflowTasks && conditionContainsNumber(condition, task.id)) Object.assign(task, patch);
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === workflowTaskEvents) {
          events.push({ id: events.length + 1, ...values });
          return;
        }
        if (table === auditLogs) {
          audits.push({ id: audits.length + 1, ...values });
          return;
        }
        throw new Error("Tabela inesperada no harness D-012D.");
      },
    }),
  };

  return {
    db: { transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) },
    task,
    user,
    events,
    audits,
    getTaskLocks: () => taskLocks,
  };
}

let originalNodeEnv: string | undefined;
beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
});
afterEach(() => {
  setDbForTesting(null);
  process.env.NODE_ENV = originalNodeEnv;
});

describe("D-012D claim/start transacional", () => {
  it("faz claim por usuário elegível com lock, evento e auditoria", async () => {
    const harness = createHarness();
    setDbForTesting(harness.db as never);

    const result = await claimWorkflowTask({ taskId: 1, actorUserId: 7, correlationId: "corr-claim-user" });

    expect(harness.getTaskLocks()).toBe(1);
    expect(result).toMatchObject({ taskId: 1, status: "open", claimedByUserId: 7 });
    expect(harness.task).toMatchObject({ claimedByUserId: 7, correlationId: "corr-claim-user" });
    expect(harness.events.at(-1)).toMatchObject({ taskId: 1, action: "claim", actorUserId: 7, correlationId: "corr-claim-user" });
    expect(harness.audits.at(-1)).toMatchObject({ resourceType: "workflow_task", resourceId: 1, action: "workflow_task.claim", actorUserId: 7 });
  });

  it("permite claim por equipe e por papel somente para usuário ativo elegível", async () => {
    const teamHarness = createHarness({
      task: { assignmentType: "team", assigneeUserId: null, assigneeTeamId: 20 },
      user: { id: 8, teamId: 20 },
    });
    setDbForTesting(teamHarness.db as never);
    await expect(claimWorkflowTask({ taskId: 1, actorUserId: 8, correlationId: "corr-team" })).resolves.toMatchObject({ claimedByUserId: 8 });

    const roleHarness = createHarness({
      task: { assignmentType: "role", assigneeUserId: null, assigneeRole: "despachador" },
      user: { id: 9, operationalRole: "despachador" },
    });
    setDbForTesting(roleHarness.db as never);
    await expect(claimWorkflowTask({ taskId: 1, actorUserId: 9, correlationId: "corr-role" })).resolves.toMatchObject({ claimedByUserId: 9 });

    const inactiveHarness = createHarness({ user: { active: false } });
    setDbForTesting(inactiveHarness.db as never);
    await expect(claimWorkflowTask({ taskId: 1, actorUserId: 7, correlationId: "corr-inactive" })).rejects.toThrow("elegível");
    expect(inactiveHarness.events).toHaveLength(0);
    expect(inactiveHarness.audits).toHaveLength(0);
  });

  it("é idempotente para o mesmo claimant e bloqueia concorrente diferente", async () => {
    const sameHarness = createHarness({ task: { claimedByUserId: 7, claimedAt: new Date("2026-09-13T18:10:00.000Z") } });
    setDbForTesting(sameHarness.db as never);
    await expect(claimWorkflowTask({ taskId: 1, actorUserId: 7, correlationId: "corr-retry" })).resolves.toMatchObject({ claimedByUserId: 7, status: "open" });
    expect(sameHarness.events).toHaveLength(0);
    expect(sameHarness.audits).toHaveLength(0);

    const otherHarness = createHarness({
      task: { claimedByUserId: 8, claimedAt: new Date("2026-09-13T18:10:00.000Z") },
      user: { id: 7 },
    });
    setDbForTesting(otherHarness.db as never);
    await expect(claimWorkflowTask({ taskId: 1, actorUserId: 7, correlationId: "corr-conflict" })).rejects.toThrow("já foi assumida");
    expect(otherHarness.task.claimedByUserId).toBe(8);
  });

  it("start exige claim do próprio ator e muda a tarefa para in_progress", async () => {
    const harness = createHarness({ task: { claimedByUserId: 7, claimedAt: new Date("2026-09-13T18:10:00.000Z") } });
    setDbForTesting(harness.db as never);

    const result = await startWorkflowTask({ taskId: 1, actorUserId: 7, correlationId: "corr-start-task" });

    expect(harness.getTaskLocks()).toBe(1);
    expect(result).toMatchObject({ taskId: 1, status: "in_progress", claimedByUserId: 7 });
    expect(harness.task).toMatchObject({ status: "in_progress", correlationId: "corr-start-task" });
    expect(harness.task.startedAt).toBeInstanceOf(Date);
    expect(harness.events.at(-1)).toMatchObject({ action: "start", actorUserId: 7 });
    expect(harness.audits.at(-1)).toMatchObject({ action: "workflow_task.start", actorUserId: 7 });
  });

  it("start falha fechado sem claim, por outro ator ou fora do estado open", async () => {
    const unclaimed = createHarness();
    setDbForTesting(unclaimed.db as never);
    await expect(startWorkflowTask({ taskId: 1, actorUserId: 7, correlationId: "corr-no-claim" })).rejects.toThrow("claim");

    const other = createHarness({ task: { claimedByUserId: 8 }, user: { id: 7 } });
    setDbForTesting(other.db as never);
    await expect(startWorkflowTask({ taskId: 1, actorUserId: 7, correlationId: "corr-other" })).rejects.toThrow("claimant");

    const completed = createHarness({ task: { status: "completed", claimedByUserId: 7 } });
    setDbForTesting(completed.db as never);
    await expect(startWorkflowTask({ taskId: 1, actorUserId: 7, correlationId: "corr-terminal" })).rejects.toThrow("open");
  });
});
