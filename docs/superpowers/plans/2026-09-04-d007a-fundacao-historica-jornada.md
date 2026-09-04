# D-007A — Fundação Histórica da Jornada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a fonte histórica e auditável da jornada individual no AXE Dispatch, preservando o controle legado de equipe e preparando a base para escalas, despacho e relatórios das fases D-007B/C/D.

**Architecture:** A D-007A introduz `work_shift_sessions` e `work_shift_events`, um domínio puro para transições `start/pause/resume/end`, um serviço transacional orientado a uma porta de persistência e três contratos tRPC para consultar/controlar a própria jornada. O estado legado de `teams` continua existindo como cache/compatibilidade e é espelhado somente quando a nova jornada individual possui `teamId`; o endpoint legado `teams.updateShift` não é removido nesta fase.

**Tech Stack:** TypeScript 5.9, Node 24, Express/tRPC 11, Drizzle ORM 0.45 + MySQL, Zod 4, Vitest 2, pnpm 10.4.1.

**Spec:** `docs/superpowers/specs/2026-09-04-d007-controle-jornada-design.md`

## Global Constraints

- Basear a implementação em `checkpoint/d006e-csp-frame-src-20260904` / design aprovado da D-007.
- Manter `teams.shiftStartedAt`, `teams.shiftEndsAt`, `teams.shiftPausedAt` e `teams.shiftPausedTotalSeconds`; não remover nem renomear nesta fase.
- Não alterar automaticamente `teams.status` ao iniciar, pausar, retomar ou encerrar jornada.
- Uma única sessão não encerrada por usuário; concorrência deve ser serializada no banco antes de decidir `start`.
- O servidor define o timestamp efetivo das ações; a API de controle não aceita timestamp arbitrário do cliente.
- Eventos de jornada são append-only no fluxo normal.
- D-007A não implementa escalas, 12x36, exceções, ajustes, alertas, relatórios administrativos nem filtro de despacho; estes pertencem às D-007B/C/D.
- Não criar `work_shift_schedules`, `work_shift_assignments`, `work_shift_schedule_exceptions` ou `work_shift_adjustments` nesta entrega.
- Não conceder as novas permissões a papéis existentes automaticamente. Criar somente o catálogo `work_shifts.view` e `work_shifts.control`; `role_permissions` não recebe grants nesta migration.
- O administrador legado com wildcard `*` continua compatível.
- Nenhum `db:push`, migration contra banco real, merge em `main` ou deploy durante a execução deste plano.
- Cada task usa TDD: RED observado antes do GREEN e commit pequeno após os testes correspondentes.
- Ao final, executar os mesmos gates do workflow `Qualidade`: `security:check`, `check`, `test`, `build`, além dos workflows GIS/NEO já existentes para regressão.

---

## File Map

**Create**
- `shared/workShifts.ts` — ações/status/tipos compartilhados da jornada individual.
- `server/workShiftDomain.ts` — máquina de estados pura e cálculos de pausa/tempo líquido.
- `server/workShiftDomain.test.ts` — testes unitários da máquina de estados.
- `server/workShiftService.ts` — orquestração independente de Drizzle através de `WorkShiftStore`.
- `server/workShiftService.test.ts` — fake store cobrindo histórico/eventos/espelhamento.
- `server/workShifts.router.test.ts` — contratos tRPC e RBAC da própria jornada.
- `drizzle/0003_d007a_work_shift_history.sql` — migration gerada/revisada para sessões/eventos + catálogo de permissões.

**Modify**
- `drizzle/schema.ts` — enums/tabelas `workShiftSessions` e `workShiftEvents`.
- `server/db.ts` — adapter Drizzle transacional e consultas da própria jornada.
- `server/routers.ts` — router `workShifts` com `current`, `history`, `control`.
- `server/accessControl.test.ts` — comprovar permissão dinâmica sem grant legado implícito.
- `scripts/generate-trpc-coverage.mjs` — incluir raiz `workShifts` e atualizar a contagem de procedimentos.
- `docs/TRPC_CONTRACT_COVERAGE.md` — regenerado pelo script.
- `server/teamShift.test.ts` — preservar comportamento legado da equipe.
- `server/triageAndShift.router.test.ts` — preservar `teams.updateShift` existente.
- `todo.md` — marcar somente os itens efetivamente concluídos da D-007A.

---

### Task 1: Contrato compartilhado e máquina de estados pura

**Files:**
- Create: `shared/workShifts.ts`
- Create: `server/workShiftDomain.ts`
- Create: `server/workShiftDomain.test.ts`

**Interfaces:**
- Produces: `WORK_SHIFT_ACTIONS`, `WORK_SHIFT_STATUSES`, `WorkShiftAction`, `WorkShiftStatus`.
- Produces: `resolveWorkShiftTransition(current, action, now): WorkShiftTransitionPlan`.
- Consumes later: Task 3 usa `WorkShiftTransitionPlan` para persistir sessão/evento e Task 4 usa o mesmo contrato no adapter Drizzle.

- [ ] **Step 1: criar o teste RED da máquina de estados**

Criar `server/workShiftDomain.test.ts` com casos determinísticos:

```ts
import { describe, expect, it } from "vitest";
import { resolveWorkShiftTransition } from "./workShiftDomain";

const startAt = new Date("2026-09-04T08:00:00.000Z");

const active = {
  id: 10,
  startedAt: startAt,
  pausedAt: null,
  endedAt: null,
  status: "active" as const,
  pausedSeconds: 0,
};

describe("work shift domain", () => {
  it("inicia uma nova sessão somente quando não existe sessão aberta", () => {
    expect(resolveWorkShiftTransition(null, "start", startAt)).toEqual({
      mode: "create",
      eventType: "started",
      session: {
        startedAt: startAt,
        pausedAt: null,
        endedAt: null,
        status: "active",
        pausedSeconds: 0,
        workedSeconds: 0,
      },
      legacyPatch: {
        shiftStartedAt: startAt,
        shiftEndsAt: null,
        shiftPausedAt: null,
        shiftPausedTotalSeconds: 0,
      },
    });
  });

  it("acumula pausas em resume e calcula tempo líquido ao encerrar", () => {
    const pauseAt = new Date("2026-09-04T10:00:00.000Z");
    const resumeAt = new Date("2026-09-04T10:15:30.000Z");
    const endAt = new Date("2026-09-04T12:00:00.000Z");

    const paused = resolveWorkShiftTransition(active, "pause", pauseAt);
    expect(paused.sessionPatch).toEqual({ status: "paused", pausedAt: pauseAt });

    const resumed = resolveWorkShiftTransition({ ...active, status: "paused", pausedAt: pauseAt }, "resume", resumeAt);
    expect(resumed.sessionPatch).toEqual({ status: "active", pausedAt: null, pausedSeconds: 930 });

    const ended = resolveWorkShiftTransition({ ...active, pausedSeconds: 930 }, "end", endAt);
    expect(ended.sessionPatch).toEqual({
      status: "ended",
      pausedAt: null,
      endedAt: endAt,
      pausedSeconds: 930,
      workedSeconds: 13530,
    });
  });

  it("inclui a pausa corrente quando encerra uma sessão pausada", () => {
    const pausedAt = new Date("2026-09-04T11:45:00.000Z");
    const endAt = new Date("2026-09-04T12:00:00.000Z");
    const ended = resolveWorkShiftTransition({ ...active, status: "paused", pausedAt, pausedSeconds: 300 }, "end", endAt);
    expect(ended.sessionPatch.pausedSeconds).toBe(1200);
    expect(ended.sessionPatch.workedSeconds).toBe(13200);
  });

  it("rejeita transições incompatíveis", () => {
    expect(() => resolveWorkShiftTransition(null, "pause", startAt)).toThrow("Inicie a jornada");
    expect(() => resolveWorkShiftTransition(active, "start", startAt)).toThrow("já está em andamento");
    expect(() => resolveWorkShiftTransition(active, "resume", startAt)).toThrow("não está em pausa");
  });
});
```

- [ ] **Step 2: executar o RED**

Run:

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftDomain.test.ts
```

Expected: FAIL porque `server/workShiftDomain.ts`/`resolveWorkShiftTransition` ainda não existem.

- [ ] **Step 3: criar os contratos compartilhados**

Criar `shared/workShifts.ts`:

```ts
export const WORK_SHIFT_ACTIONS = ["start", "pause", "resume", "end"] as const;
export const WORK_SHIFT_STATUSES = ["active", "paused", "ended", "cancelled"] as const;
export const WORK_SHIFT_EVENT_TYPES = ["started", "paused", "resumed", "ended", "cancelled"] as const;
export const WORK_SHIFT_SOURCES = ["self", "supervisor", "admin", "migration", "system"] as const;

export type WorkShiftAction = (typeof WORK_SHIFT_ACTIONS)[number];
export type WorkShiftStatus = (typeof WORK_SHIFT_STATUSES)[number];
export type WorkShiftEventType = (typeof WORK_SHIFT_EVENT_TYPES)[number];
export type WorkShiftSource = (typeof WORK_SHIFT_SOURCES)[number];
```

- [ ] **Step 4: implementar o GREEN mínimo do domínio**

Criar `server/workShiftDomain.ts` com estes tipos e regras:

```ts
import type { WorkShiftAction, WorkShiftEventType, WorkShiftStatus } from "../shared/workShifts";

export type OpenWorkShiftSnapshot = {
  id: number;
  startedAt: Date;
  pausedAt: Date | null;
  endedAt: Date | null;
  status: Extract<WorkShiftStatus, "active" | "paused">;
  pausedSeconds: number;
};

export type WorkShiftLegacyPatch = {
  shiftStartedAt?: Date;
  shiftEndsAt?: Date | null;
  shiftPausedAt?: Date | null;
  shiftPausedTotalSeconds?: number;
};

export type WorkShiftTransitionPlan =
  | {
      mode: "create";
      eventType: WorkShiftEventType;
      session: {
        startedAt: Date;
        pausedAt: null;
        endedAt: null;
        status: "active";
        pausedSeconds: 0;
        workedSeconds: 0;
      };
      legacyPatch: WorkShiftLegacyPatch;
    }
  | {
      mode: "update";
      eventType: WorkShiftEventType;
      sessionPatch: {
        status: WorkShiftStatus;
        pausedAt?: Date | null;
        endedAt?: Date;
        pausedSeconds?: number;
        workedSeconds?: number;
      };
      legacyPatch: WorkShiftLegacyPatch;
    };

function elapsedSeconds(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

export function resolveWorkShiftTransition(
  current: OpenWorkShiftSnapshot | null,
  action: WorkShiftAction,
  now = new Date(),
): WorkShiftTransitionPlan {
  if (action === "start") {
    if (current) throw new Error("A jornada já está em andamento.");
    return {
      mode: "create",
      eventType: "started",
      session: { startedAt: now, pausedAt: null, endedAt: null, status: "active", pausedSeconds: 0, workedSeconds: 0 },
      legacyPatch: { shiftStartedAt: now, shiftEndsAt: null, shiftPausedAt: null, shiftPausedTotalSeconds: 0 },
    };
  }

  if (!current) throw new Error("Inicie a jornada antes desta operação.");

  if (action === "pause") {
    if (current.status !== "active") throw new Error("A jornada já está em pausa.");
    return { mode: "update", eventType: "paused", sessionPatch: { status: "paused", pausedAt: now }, legacyPatch: { shiftPausedAt: now } };
  }

  if (action === "resume") {
    if (current.status !== "paused" || !current.pausedAt) throw new Error("A jornada não está em pausa.");
    const pausedSeconds = current.pausedSeconds + elapsedSeconds(current.pausedAt, now);
    return { mode: "update", eventType: "resumed", sessionPatch: { status: "active", pausedAt: null, pausedSeconds }, legacyPatch: { shiftPausedAt: null, shiftPausedTotalSeconds: pausedSeconds } };
  }

  const pausedSeconds = current.pausedSeconds + (current.pausedAt ? elapsedSeconds(current.pausedAt, now) : 0);
  const workedSeconds = Math.max(0, elapsedSeconds(current.startedAt, now) - pausedSeconds);
  return {
    mode: "update",
    eventType: "ended",
    sessionPatch: { status: "ended", pausedAt: null, endedAt: now, pausedSeconds, workedSeconds },
    legacyPatch: { shiftEndsAt: now, shiftPausedAt: null, shiftPausedTotalSeconds: pausedSeconds },
  };
}
```

- [ ] **Step 5: executar testes direcionados e legado**

Run:

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftDomain.test.ts server/teamShift.test.ts
```

Expected: PASS; o teste legado continua verde sem alteração de `resolveTeamShiftAction`.

- [ ] **Step 6: commit**

```bash
git add shared/workShifts.ts server/workShiftDomain.ts server/workShiftDomain.test.ts
git commit -m "feat(d007): add historical work shift domain"
```

---

### Task 2: Persistência histórica no schema e migration segura

**Files:**
- Modify: `drizzle/schema.ts`
- Create: `drizzle/0003_d007a_work_shift_history.sql`
- Generated/Modify: `drizzle/meta/_journal.json`
- Generated/Create: snapshot correspondente em `drizzle/meta/`
- Create: `server/workShiftSchema.test.ts`

**Interfaces:**
- Produces: `workShiftSessions`, `workShiftEvents`, `workShiftSessionStatusEnum`, `workShiftSourceEnum`.
- Task 4 importa as tabelas diretamente do schema.

- [ ] **Step 1: escrever teste RED do schema**

Criar `server/workShiftSchema.test.ts`:

```ts
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { workShiftEvents, workShiftSessions } from "../drizzle/schema";

it("expõe as tabelas históricas da jornada", () => {
  expect(getTableName(workShiftSessions)).toBe("work_shift_sessions");
  expect(getTableName(workShiftEvents)).toBe("work_shift_events");
});

describe("campos mínimos da D-007A", () => {
  it("mantém usuário obrigatório e equipe opcional na sessão", () => {
    expect(workShiftSessions.userId.notNull).toBe(true);
    expect(workShiftSessions.teamId.notNull).toBe(false);
    expect(workShiftSessions.startedAt.notNull).toBe(true);
    expect(workShiftSessions.pausedSeconds.notNull).toBe(true);
  });
});
```

- [ ] **Step 2: executar RED**

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftSchema.test.ts
```

Expected: FAIL porque as tabelas ainda não existem.

- [ ] **Step 3: adicionar enums e tabelas ao `drizzle/schema.ts`**

Adicionar próximos aos demais enums:

```ts
export const workShiftSessionStatusEnum = mysqlEnum("work_shift_session_status", ["active", "paused", "ended", "cancelled"]);
export const workShiftSourceEnum = mysqlEnum("work_shift_source", ["self", "supervisor", "admin", "migration", "system"]);
```

Adicionar tabelas após `users`/`teams` estarem declaradas:

```ts
export const workShiftSessions = mysqlTable(
  "work_shift_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id),
    teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at").notNull(),
    pausedAt: timestamp("paused_at"),
    endedAt: timestamp("ended_at"),
    status: workShiftSessionStatusEnum.notNull(),
    workedSeconds: int("worked_seconds").notNull().default(0),
    pausedSeconds: int("paused_seconds").notNull().default(0),
    overtimeSeconds: int("overtime_seconds").notNull().default(0),
    lateStartSeconds: int("late_start_seconds").notNull().default(0),
    earlyEndSeconds: int("early_end_seconds").notNull().default(0),
    source: workShiftSourceEnum.notNull().default("self"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("work_shift_sessions_user_started_idx").on(table.userId, table.startedAt),
    index("work_shift_sessions_user_status_idx").on(table.userId, table.status),
    index("work_shift_sessions_team_started_idx").on(table.teamId, table.startedAt),
  ],
);

export const workShiftEvents = mysqlTable(
  "work_shift_events",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("session_id").notNull().references(() => workShiftSessions.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 48 }).notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    actorUserId: int("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    beforeData: json("before_data").$type<Record<string, unknown> | null>(),
    afterData: json("after_data").$type<Record<string, unknown> | null>(),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("work_shift_events_session_occurred_idx").on(table.sessionId, table.occurredAt)],
);
```

Não adicionar ainda `scheduleAssignmentId`, `scheduledStartAt` e `scheduledEndAt`; esses campos entram junto com as FKs da D-007B para não criar referência órfã.

- [ ] **Step 4: gerar migration sem conectar em banco real**

Use uma URL sintaticamente válida apenas para carregar `drizzle.config.ts`; `generate` não deve aplicar SQL:

```bash
DATABASE_URL='mysql://root:plan-only@127.0.0.1:3306/dispatch_plan' \
  corepack pnpm exec drizzle-kit generate --name d007a_work_shift_history
```

Expected: criar `drizzle/0003_d007a_work_shift_history.sql` e atualizar metadata. **Não executar `drizzle-kit migrate` nem `pnpm db:push`.**

- [ ] **Step 5: acrescentar somente o catálogo de permissões na migration**

Depois do SQL gerado, adicionar ao final, usando os nomes reais das colunas de `access_permissions` confirmados no schema:

```sql
INSERT INTO `access_permissions` (`code`, `name`, `description`, `active`)
VALUES
  ('work_shifts.view', 'Consultar jornada', 'Consulta a própria jornada e histórico autorizado.', true),
  ('work_shifts.control', 'Controlar própria jornada', 'Inicia, pausa, retoma e encerra a própria jornada.', true)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `active` = VALUES(`active`);
```

Não inserir linhas em `role_permissions`.

- [ ] **Step 6: verificar migration e schema**

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftSchema.test.ts
corepack pnpm check
```

Expected: PASS.

- [ ] **Step 7: commit**

```bash
git add drizzle/schema.ts drizzle/0003_d007a_work_shift_history.sql drizzle/meta server/workShiftSchema.test.ts
git commit -m "feat(d007): add work shift history schema"
```

---

### Task 3: Serviço transacional independente do Drizzle

**Files:**
- Create: `server/workShiftService.ts`
- Create: `server/workShiftService.test.ts`

**Interfaces:**
- Consumes: `resolveWorkShiftTransition` da Task 1.
- Produces: `WorkShiftStore` e `executeOwnWorkShiftAction(store, input)`.
- Task 4 implementa `WorkShiftStore` dentro de uma transaction Drizzle.

- [ ] **Step 1: escrever o fake store e testes RED**

Criar `server/workShiftService.test.ts` com fake explícito:

```ts
import { describe, expect, it, vi } from "vitest";
import { executeOwnWorkShiftAction, type WorkShiftStore } from "./workShiftService";

function store(current: Awaited<ReturnType<WorkShiftStore["getOpenSession"]>> = null): WorkShiftStore {
  return {
    getOpenSession: vi.fn().mockResolvedValue(current),
    createSession: vi.fn().mockResolvedValue({ id: 77 }),
    updateSession: vi.fn().mockResolvedValue(undefined),
    appendEvent: vi.fn().mockResolvedValue(undefined),
    mirrorTeam: vi.fn().mockResolvedValue(undefined),
  };
}

describe("executeOwnWorkShiftAction", () => {
  it("cria sessão, evento e espelho legado no start", async () => {
    const fake = store();
    const now = new Date("2026-09-04T08:00:00.000Z");

    await executeOwnWorkShiftAction(fake, { userId: 7, teamId: 3, action: "start", now });

    expect(fake.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, teamId: 3, source: "self", status: "active", startedAt: now }));
    expect(fake.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 77, eventType: "started", actorUserId: 7, occurredAt: now }));
    expect(fake.mirrorTeam).toHaveBeenCalledWith(3, expect.objectContaining({ shiftStartedAt: now }));
  });

  it("não tenta espelhar equipe quando o usuário não possui teamId", async () => {
    const fake = store();
    await executeOwnWorkShiftAction(fake, { userId: 7, teamId: null, action: "start", now: new Date("2026-09-04T08:00:00.000Z") });
    expect(fake.mirrorTeam).not.toHaveBeenCalled();
  });
});
```

Adicionar casos de `pause`, `resume`, `end` verificando `updateSession`, `appendEvent` e `mirrorTeam`.

- [ ] **Step 2: executar RED**

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftService.test.ts
```

Expected: FAIL por módulo/funções ausentes.

- [ ] **Step 3: implementar a porta e o serviço mínimo**

Criar `server/workShiftService.ts`:

```ts
import type { WorkShiftAction, WorkShiftSource } from "../shared/workShifts";
import { resolveWorkShiftTransition, type OpenWorkShiftSnapshot, type WorkShiftLegacyPatch } from "./workShiftDomain";

export type WorkShiftStore = {
  getOpenSession(userId: number): Promise<OpenWorkShiftSnapshot | null>;
  createSession(input: {
    userId: number;
    teamId: number | null;
    source: WorkShiftSource;
    startedAt: Date;
    pausedAt: null;
    endedAt: null;
    status: "active";
    pausedSeconds: number;
    workedSeconds: number;
  }): Promise<{ id: number }>;
  updateSession(sessionId: number, patch: Record<string, unknown>): Promise<void>;
  appendEvent(input: {
    sessionId: number;
    eventType: string;
    actorUserId: number;
    occurredAt: Date;
    beforeData: Record<string, unknown> | null;
    afterData: Record<string, unknown> | null;
  }): Promise<void>;
  mirrorTeam(teamId: number, patch: WorkShiftLegacyPatch): Promise<void>;
};

export async function executeOwnWorkShiftAction(
  store: WorkShiftStore,
  input: { userId: number; teamId: number | null; action: WorkShiftAction; now?: Date },
) {
  const now = input.now ?? new Date();
  const before = await store.getOpenSession(input.userId);
  const plan = resolveWorkShiftTransition(before, input.action, now);

  let sessionId: number;
  if (plan.mode === "create") {
    sessionId = (await store.createSession({ userId: input.userId, teamId: input.teamId, source: "self", ...plan.session })).id;
  } else {
    if (!before) throw new Error("Sessão de jornada não encontrada.");
    sessionId = before.id;
    await store.updateSession(sessionId, plan.sessionPatch);
  }

  await store.appendEvent({
    sessionId,
    eventType: plan.eventType,
    actorUserId: input.userId,
    occurredAt: now,
    beforeData: before ? { ...before } : null,
    afterData: plan.mode === "create" ? { ...plan.session } : { ...plan.sessionPatch },
  });

  if (input.teamId !== null) await store.mirrorTeam(input.teamId, plan.legacyPatch);
  return { sessionId, eventType: plan.eventType };
}
```

- [ ] **Step 4: executar GREEN e testes do domínio**

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftDomain.test.ts server/workShiftService.test.ts
```

Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add server/workShiftService.ts server/workShiftService.test.ts
git commit -m "feat(d007): orchestrate historical work shift actions"
```

---

### Task 4: Adapter Drizzle transacional, histórico e compatibilidade com equipe

**Files:**
- Modify: `server/db.ts`
- Create: `server/workShiftDbContract.test.ts`

**Interfaces:**
- Produces: `controlOwnWorkShift(input)`.
- Produces: `getOwnCurrentWorkShift(userId)`.
- Produces: `listOwnWorkShiftHistory({ userId, page, pageSize })`.
- Consumes: `executeOwnWorkShiftAction` e tabelas da Task 2.

- [ ] **Step 1: criar teste RED do contrato de persistência**

Criar `server/workShiftDbContract.test.ts` como teste estrutural focado apenas em invariantes que não dependem de MySQL externo:

```ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("adapter transacional da jornada", () => {
  it("serializa por usuário antes de executar a ação", () => {
    expect(source).toContain("export async function controlOwnWorkShift");
    expect(source).toContain("db.transaction");
    expect(source).toContain('.for("update")');
    expect(source).toContain("executeOwnWorkShiftAction");
  });

  it("persiste sessão/evento e preserva o espelho legado de equipe", () => {
    expect(source).toContain("workShiftSessions");
    expect(source).toContain("workShiftEvents");
    expect(source).toContain("tx.update(teams)");
  });
});
```

Este teste não substitui a integração de banco futura; ele protege a presença da transação/lock no gate local, enquanto a lógica transacional é exercitada por `workShiftService.test.ts`.

- [ ] **Step 2: executar RED**

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftDbContract.test.ts
```

Expected: FAIL.

- [ ] **Step 3: adicionar imports no `server/db.ts`**

Adicionar `workShiftSessions`, `workShiftEvents` aos imports do schema e:

```ts
import { executeOwnWorkShiftAction, type WorkShiftStore } from "./workShiftService";
```

- [ ] **Step 4: implementar consulta da sessão atual**

Adicionar:

```ts
export async function getOwnCurrentWorkShift(userId: number) {
  const db = await requireDb();
  return (
    await db
      .select()
      .from(workShiftSessions)
      .where(and(eq(workShiftSessions.userId, userId), inArray(workShiftSessions.status, ["active", "paused"])))
      .orderBy(desc(workShiftSessions.startedAt))
      .limit(1)
  )[0] ?? null;
}
```

- [ ] **Step 5: implementar histórico paginado próprio**

```ts
export async function listOwnWorkShiftHistory(input: { userId: number; page: number; pageSize: number }) {
  const db = await requireDb();
  const where = eq(workShiftSessions.userId, input.userId);
  const [rows, totalRows] = await Promise.all([
    db.select().from(workShiftSessions).where(where).orderBy(desc(workShiftSessions.startedAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(workShiftSessions).where(where),
  ]);
  return { rows, total: Number(totalRows[0]?.total ?? 0) };
}
```

- [ ] **Step 6: implementar `controlOwnWorkShift` com lock do usuário**

O corpo deve seguir esta forma, mantendo tudo na mesma transaction:

```ts
export async function controlOwnWorkShift(input: { userId: number; teamId: number | null; action: "start" | "pause" | "resume" | "end" }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const lockedUser = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1).for("update");
    if (!lockedUser[0]) throw new Error("Usuário não encontrado.");

    const store: WorkShiftStore = {
      async getOpenSession(userId) {
        const row = (await tx.select().from(workShiftSessions)
          .where(and(eq(workShiftSessions.userId, userId), inArray(workShiftSessions.status, ["active", "paused"])))
          .orderBy(desc(workShiftSessions.startedAt)).limit(1))[0];
        return row ? { id: row.id, startedAt: row.startedAt, pausedAt: row.pausedAt, endedAt: row.endedAt, status: row.status as "active" | "paused", pausedSeconds: row.pausedSeconds } : null;
      },
      async createSession(values) {
        const [created] = await tx.insert(workShiftSessions).values(values).$returningId();
        return { id: created.id };
      },
      async updateSession(sessionId, patch) {
        await tx.update(workShiftSessions).set(patch).where(eq(workShiftSessions.id, sessionId));
      },
      async appendEvent(event) {
        await tx.insert(workShiftEvents).values(event);
      },
      async mirrorTeam(teamId, patch) {
        await tx.update(teams).set(patch).where(eq(teams.id, teamId));
      },
    };

    return executeOwnWorkShiftAction(store, input);
  });
}
```

Antes de finalizar, fazer o TypeScript inferir os patches com tipos de Drizzle; não usar `as any`.

- [ ] **Step 7: executar testes e tipagem**

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftDomain.test.ts server/workShiftService.test.ts server/workShiftDbContract.test.ts server/teamShift.test.ts
corepack pnpm check
```

Expected: PASS.

- [ ] **Step 8: commit**

```bash
git add server/db.ts server/workShiftDbContract.test.ts
git commit -m "feat(d007): persist own work shift history transactionally"
```

---

### Task 5: Router tRPC e RBAC específico

**Files:**
- Modify: `server/routers.ts`
- Create: `server/workShifts.router.test.ts`
- Modify: `server/accessControl.test.ts`

**Interfaces:**
- Produces tRPC: `workShifts.current`, `workShifts.history`, `workShifts.control`.
- RBAC: `work_shifts.view` para leitura; `work_shifts.control` para ação própria.
- O `control` não aceita `userId`, `teamId` ou timestamp do cliente; usa exclusivamente `ctx.user.id` e `ctx.user.teamId`.

- [ ] **Step 1: escrever RED do router usando o padrão de mocks existente**

Criar `server/workShifts.router.test.ts` baseado em `triageAndShift.router.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  getOwnCurrentWorkShift: vi.fn(),
  listOwnWorkShiftHistory: vi.fn(),
  controlOwnWorkShift: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getOwnCurrentWorkShift: mocks.getOwnCurrentWorkShift,
  listOwnWorkShiftHistory: mocks.listOwnWorkShiftHistory,
  controlOwnWorkShift: mocks.controlOwnWorkShift,
}));

import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "d007-agent",
      name: "Agente D007",
      email: "agent@test.local",
      loginMethod: "test",
      role: "user",
      operationalRole: "agente",
      teamId: 3,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("workShifts router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.getOwnCurrentWorkShift.mockResolvedValue(null);
    mocks.listOwnWorkShiftHistory.mockResolvedValue({ rows: [], total: 0 });
    mocks.controlOwnWorkShift.mockResolvedValue({ sessionId: 77, eventType: "started" });
  });

  it("usa view para current/history e restringe a consulta ao próprio usuário", async () => {
    const caller = appRouter.createCaller(context());
    await caller.workShifts.current();
    await caller.workShifts.history({ page: 1, pageSize: 25 });
    expect(mocks.assertPermission).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 7 }), "work_shifts.view");
    expect(mocks.assertPermission).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 7 }), "work_shifts.view");
    expect(mocks.listOwnWorkShiftHistory).toHaveBeenCalledWith({ userId: 7, page: 1, pageSize: 25 });
  });

  it("usa control e deriva user/team do contexto autenticado", async () => {
    const caller = appRouter.createCaller(context());
    await caller.workShifts.control({ action: "start" });
    expect(mocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "work_shifts.control");
    expect(mocks.controlOwnWorkShift).toHaveBeenCalledWith({ userId: 7, teamId: 3, action: "start" });
  });
});
```

- [ ] **Step 2: executar RED**

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShifts.router.test.ts
```

Expected: FAIL porque `workShifts` ainda não existe no `appRouter`.

- [ ] **Step 3: adicionar imports e router**

Em `server/routers.ts`, importar `WORK_SHIFT_ACTIONS` e as três funções do `db.ts`. Adicionar no nível raiz do `appRouter`:

```ts
workShifts: router({
  current: operationalProcedure.query(async ({ ctx }) => {
    await assertPermission(ctx.user, "work_shifts.view");
    return getOwnCurrentWorkShift(ctx.user.id);
  }),
  history: operationalProcedure
    .input(paginationInput)
    .query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "work_shifts.view");
      return listOwnWorkShiftHistory({ userId: ctx.user.id, ...input });
    }),
  control: operationalProcedure
    .input(z.object({ action: z.enum(WORK_SHIFT_ACTIONS) }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "work_shifts.control");
      return controlOwnWorkShift({ userId: ctx.user.id, teamId: ctx.user.teamId, action: input.action });
    }),
}),
```

- [ ] **Step 4: comprovar que permissão dinâmica funciona sem grant legado implícito**

Adicionar a `server/accessControl.test.ts`:

```ts
it("reconhece permissões dinâmicas de jornada sem concedê-las ao agente legado", () => {
  expect(evaluatePermission({ active: true, operationalRole: "agente", hasDynamicAssignments: true, dynamicPermissions: ["work_shifts.view", "work_shifts.control"] }, "work_shifts.control")).toBe(true);
  expect(evaluatePermission({ active: true, operationalRole: "agente", hasDynamicAssignments: false, dynamicPermissions: [] }, "work_shifts.control")).toBe(false);
  expect(evaluatePermission({ active: true, operationalRole: "administrador", hasDynamicAssignments: false, dynamicPermissions: [] }, "work_shifts.control")).toBe(true);
});
```

- [ ] **Step 5: executar GREEN do router/RBAC**

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShifts.router.test.ts server/accessControl.test.ts server/triageAndShift.router.test.ts
```

Expected: PASS; `teams.updateShift` continua operando no teste legado.

- [ ] **Step 6: commit**

```bash
git add server/routers.ts server/workShifts.router.test.ts server/accessControl.test.ts
git commit -m "feat(d007): expose own work shift API with RBAC"
```

---

### Task 6: Cobertura tRPC e invariantes de compatibilidade

**Files:**
- Modify: `scripts/generate-trpc-coverage.mjs`
- Modify: `docs/TRPC_CONTRACT_COVERAGE.md`
- Modify: `server/teamShift.test.ts`
- Modify: `server/triageAndShift.router.test.ts` only if an explicit compatibility assertion is missing after Task 5.

**Interfaces:**
- Coverage root: `workShifts`.
- Expected tRPC surface after adding 3 procedures: 100 procedures (97 atuais + 3 D-007A), unless execution discovers another concurrent intentional router change; in that case recompute the exact count from `server/routers.ts` and document the reason before changing the assertion.

- [ ] **Step 1: escrever RED no gerador de cobertura**

Antes de modificar o script, execute:

```bash
corepack pnpm contracts:coverage
```

Expected: FAIL por superfície tRPC inesperada e/ou raiz `workShifts` sem classificação.

- [ ] **Step 2: adicionar a regra de cobertura**

Em `scripts/generate-trpc-coverage.mjs`, adicionar:

```js
{ prefix: "workShifts", suites: ["server/workShifts.router.test.ts", "server/workShiftDomain.test.ts", "server/workShiftService.test.ts"], evidence: "Jornada individual histórica: current, history, controle start/pause/resume/end, RBAC e máquina de estados." },
```

Atualizar a asserção da superfície:

```js
if (procedures.length !== 100) {
  throw new Error(`Superfície tRPC inesperada: ${procedures.length} procedimentos encontrados; eram esperados 100.`);
}
```

Não editar manualmente as contagens de arquivos/testes no markdown gerado sem antes verificar o que o próprio script produz; se esses números estiverem hardcoded e já estiverem defasados na base, corrigi-los na mesma mudança para refletir a suíte atual observada em `pnpm test`.

- [ ] **Step 3: reforçar teste legado da equipe**

Adicionar a `server/teamShift.test.ts` uma asserção explícita de que a função legada continua independente do novo domínio:

```ts
it("mantém a máquina legada disponível durante a transição D-007A", () => {
  const startedAt = new Date("2026-09-04T08:00:00.000Z");
  expect(resolveTeamShiftAction({ startedAt: null, pausedAt: null, endedAt: null, pausedTotalSeconds: 0 }, "start", startedAt))
    .toEqual({ shiftStartedAt: startedAt, shiftEndsAt: null, shiftPausedAt: null, shiftPausedTotalSeconds: 0 });
});
```

- [ ] **Step 4: regenerar e validar inventário**

```bash
corepack pnpm contracts:coverage
corepack pnpm vitest run --config vitest.config.ts server/teamShift.test.ts server/triageAndShift.router.test.ts server/workShifts.router.test.ts
```

Expected: PASS e `docs/TRPC_CONTRACT_COVERAGE.md` contém `workShifts.current`, `workShifts.history`, `workShifts.control`.

- [ ] **Step 5: commit**

```bash
git add scripts/generate-trpc-coverage.mjs docs/TRPC_CONTRACT_COVERAGE.md server/teamShift.test.ts server/triageAndShift.router.test.ts
git commit -m "test(d007): cover work shift API and legacy compatibility"
```

---

### Task 7: Gate completo, documentação e checkpoint D-007A

**Files:**
- Modify: `todo.md`
- Create: `docs/D-007A-WORK-SHIFT-HISTORY-EVIDENCE.md`
- No production source changes in this task unless a gate exposes a defect; any defect fix gets its own RED/GREEN commit before documentation.

**Interfaces:**
- Produces evidence record with exact commit SHA, workflow run IDs and artifact digests where applicable.
- Produces immutable branch `checkpoint/d007a-work-shift-history-20260904` only after all required gates pass on the same final SHA.

- [ ] **Step 1: executar a suíte direcionada final local**

```bash
corepack pnpm vitest run --config vitest.config.ts \
  server/workShiftDomain.test.ts \
  server/workShiftSchema.test.ts \
  server/workShiftService.test.ts \
  server/workShiftDbContract.test.ts \
  server/workShifts.router.test.ts \
  server/teamShift.test.ts \
  server/triageAndShift.router.test.ts \
  server/accessControl.test.ts
```

Expected: PASS.

- [ ] **Step 2: executar o mesmo gate local do workflow Qualidade**

```bash
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

Expected: todos exit code 0. Registrar quantidade real de arquivos/testes da execução, sem copiar números antigos.

- [ ] **Step 3: inspecionar o diff de migration**

```bash
git diff checkpoint/d006e-csp-frame-src-20260904 -- drizzle/schema.ts drizzle/0003_d007a_work_shift_history.sql drizzle/meta
```

Critérios:
- somente criação de `work_shift_sessions`, `work_shift_events`, índices/FKs correspondentes e catálogo das duas permissões;
- nenhuma alteração/destruição de tabelas existentes;
- nenhum `DROP TABLE`, `DROP COLUMN` ou grant em `role_permissions`;
- nenhum dado operacional real embutido.

- [ ] **Step 4: atualizar `todo.md` sem marcar fases futuras**

Adicionar seção D-007 e marcar como concluídos apenas:

```md
## D-007 — Controle de Jornada de Trabalho

- [x] D-007A — criar domínio histórico de sessão/eventos de jornada individual.
- [x] D-007A — preservar `teams.*shift*` como compatibilidade sem alterar status operacional automaticamente.
- [x] D-007A — expor `workShifts.current`, `workShifts.history` e `workShifts.control` com RBAC específico.
- [x] D-007A — catalogar `work_shifts.view` e `work_shifts.control` sem grants automáticos.
- [ ] D-007B — escalas fixas/cíclicas, 12x36, associações e exceções.
- [ ] D-007C — elegibilidade por jornada antes do ranking GIS/despacho.
- [ ] D-007D — ajustes, administração, relatórios e alertas.
```

- [ ] **Step 5: criar documento de evidência**

Criar `docs/D-007A-WORK-SHIFT-HISTORY-EVIDENCE.md` com:

```md
# D-007A — Evidência da Fundação Histórica de Jornada

**Escopo:** sessão individual + eventos + RBAC + compatibilidade de equipe.
**Base:** `checkpoint/d006e-csp-frame-src-20260904`.

## Entregue
- `work_shift_sessions` e `work_shift_events`;
- máquina `start/pause/resume/end` testada;
- uma sessão aberta por usuário, serializada por lock transacional;
- histórico próprio paginado;
- eventos append-only;
- espelho `teams.*shift*` quando há equipe vinculada;
- `work_shifts.view` e `work_shifts.control` no catálogo, sem grants automáticos.

## Fora desta entrega
- 12x36 e escalas;
- ajustes administrativos;
- filtro de despacho;
- relatórios e alertas.

## Segurança operacional
Nenhuma migration foi aplicada em produção nesta etapa de desenvolvimento; nenhum merge/deploy foi executado.
```

Preencher o documento com SHA/run IDs reais somente depois dos gates CI.

- [ ] **Step 6: commit documental pré-CI**

```bash
git add todo.md docs/D-007A-WORK-SHIFT-HISTORY-EVIDENCE.md
git commit -m "docs(d007): record D-007A historical shift evidence"
```

- [ ] **Step 7: abrir PR Draft da branch de implementação para `main`**

Título:

```text
D-007A: fundação histórica do controle de jornada
```

Body deve declarar explicitamente: sem merge/deploy, migration somente gerada e revisada, grants de RBAC não automáticos, D-007B/C/D fora do escopo.

- [ ] **Step 8: verificar CI do SHA documental final**

Exigir, no mesmo SHA:
- `Qualidade`: success;
- `GIS visual homologation`: success;
- `NEO workspace visual homologation`: success;
- `NEO external compatibility`: success.

A D-007A não precisa criar novo workflow visual próprio porque não altera UI nesta fase. Se qualquer workflow existente falhar, investigar a causa antes de checkpointar; não classificar automaticamente como flake.

- [ ] **Step 9: atualizar evidência com IDs reais e revalidar se houver novo commit**

Se o documento receber IDs/digests e isso criar novo SHA, repetir os quatro gates no novo SHA antes do checkpoint.

- [ ] **Step 10: criar checkpoint imutável somente após GREEN final**

```bash
git branch checkpoint/d007a-work-shift-history-20260904 <FINAL_GREEN_SHA>
git push origin checkpoint/d007a-work-shift-history-20260904
```

Não mover esse checkpoint depois de criado. Qualquer correção posterior nasce em nova branch/checkpoint.

---

## Acceptance Checklist D-007A

- [ ] Sessões encerradas permanecem consultáveis após iniciar jornadas futuras.
- [ ] `start` não cria duas sessões abertas para o mesmo usuário sob concorrência serializada.
- [ ] `pause/resume/end` rejeitam estados incompatíveis.
- [ ] Múltiplas pausas acumulam segundos corretamente.
- [ ] `end` durante pausa inclui a pausa corrente antes de calcular `workedSeconds`.
- [ ] Cada ação grava exatamente um evento histórico correspondente.
- [ ] A API não aceita `userId`, `teamId` ou timestamp arbitrário do cliente para controle próprio.
- [ ] O estado legado da equipe é espelhado somente quando a sessão possui `teamId`.
- [ ] `teams.status` não é alterado pelas transições da nova jornada.
- [ ] `teams.updateShift` e seus testes existentes permanecem verdes.
- [ ] `work_shifts.view` e `work_shifts.control` existem no catálogo sem grants automáticos.
- [ ] Administrador legado `*` permanece compatível.
- [ ] `contracts:coverage` reconhece os três novos procedimentos.
- [ ] Security, TypeScript, suíte completa e build passam.
- [ ] GIS/NEO não sofrem regressão nos workflows existentes.
- [ ] Migration foi apenas gerada/revisada; não aplicada em produção.
- [ ] Checkpoint final aponta para um SHA com todos os gates verdes.

## Explicitly Deferred to Later Plans

**D-007B:** `work_shift_schedules`, `work_shift_assignments`, `work_shift_schedule_exceptions`, timezone, `cycleAnchorAt`, 12x36, sobreposição e planejamento.

**D-007C:** `evaluateDispatchEligibility`, motivos `outside_shift`/`shift_paused`, integração antes de `rankTeamCandidates`, região/localização/status operacional.

**D-007D:** `work_shift_adjustments`, aprovação/rejeição, relatórios, exportações, alertas e administração do histórico.
