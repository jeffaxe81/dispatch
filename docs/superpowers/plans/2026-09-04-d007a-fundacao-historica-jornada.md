# D-007A — Fundação Histórica da Jornada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task-by-task. Every production change follows RED → GREEN → review → commit.

**Goal:** criar a fonte histórica e auditável da jornada individual no AXE Dispatch, preservando o controle legado de equipe e preparando D-007B (escalas/12x36), D-007C (elegibilidade de despacho) e D-007D (ajustes/relatórios/alertas).

**Architecture:** D-007A introduz `work_shift_sessions` e `work_shift_events`, uma máquina de estados pura, um serviço transacional atrás de uma porta `WorkShiftStore` e três contratos tRPC de autoatendimento. Os campos `teams.*shift*` continuam existindo como compatibilidade/cache operacional e são espelhados apenas quando a sessão individual possui `teamId`. O endpoint legado `teams.updateShift` não é removido nesta fase.

**Tech Stack:** TypeScript 5.9, Node 24, Express/tRPC 11, Drizzle ORM 0.45 + MySQL, Zod 4, Vitest 2, pnpm 10.4.1.

**Spec aprovada:** `docs/superpowers/specs/2026-09-04-d007-controle-jornada-design.md`

## Restrições globais

- Base funcional: `checkpoint/d006e-csp-frame-src-20260904`; documentação aprovada está em `design/d007-work-shift-control-20260904`.
- Preservar `teams.shiftStartedAt`, `teams.shiftEndsAt`, `teams.shiftPausedAt`, `teams.shiftPausedTotalSeconds` e `teams.updateShift`.
- Não alterar automaticamente `teams.status` em transições de jornada.
- Uma única sessão não encerrada por usuário; o fluxo de escrita deve serializar pelo usuário no banco antes de decidir `start`.
- O servidor define o instante das ações; a API `control` não aceita timestamp, `userId` ou `teamId` arbitrário do cliente.
- Eventos de jornada são append-only no fluxo normal e não devem ser apagados por cascade da sessão.
- D-007A não cria `work_shift_schedules`, `work_shift_assignments`, `work_shift_schedule_exceptions` nem `work_shift_adjustments`.
- D-007A não implementa 12x36, filtro de despacho, ajustes, relatórios administrativos ou alertas.
- Criar no catálogo somente `work_shifts.view` e `work_shifts.control`; não inserir grants em `role_permissions`.
- Administrador legado com wildcard `*` permanece compatível.
- Não executar `pnpm db:push`, `drizzle-kit migrate`, migration em banco real, merge em `main` ou deploy.
- Cada task encerra com testes direcionados e commit pequeno.
- No final, executar os mesmos gates do workflow `Qualidade`: `security:check`, `check`, `test`, `build`, além dos workflows GIS/NEO de regressão.

## Mapa de arquivos

**Criar**
- `shared/workShifts.ts`
- `server/workShiftDomain.ts`
- `server/workShiftDomain.test.ts`
- `server/workShiftSchema.test.ts`
- `server/workShiftService.ts`
- `server/workShiftService.test.ts`
- `server/workShiftDbContract.test.ts`
- `server/workShifts.router.test.ts`
- `drizzle/0003_d007a_work_shift_history.sql` (nome esperado após `generate`; confirmar o nome real gerado)
- `docs/D-007A-WORK-SHIFT-HISTORY-EVIDENCE.md`

**Modificar**
- `drizzle/schema.ts`
- `drizzle/meta/_journal.json` e snapshot gerado pela ferramenta
- `server/db.ts`
- `server/routers.ts`
- `server/accessControl.test.ts`
- `server/teamShift.test.ts`
- `server/triageAndShift.router.test.ts` somente se precisar reforço de compatibilidade
- `scripts/generate-trpc-coverage.mjs`
- `docs/TRPC_CONTRACT_COVERAGE.md` (gerado)
- `todo.md`

---

## Task 1 — Contratos compartilhados e máquina de estados pura

**Files**
- Create: `shared/workShifts.ts`
- Create: `server/workShiftDomain.ts`
- Create: `server/workShiftDomain.test.ts`

### 1.1 RED — transições e cálculo

Criar `server/workShiftDomain.test.ts` cobrindo:

```ts
const startAt = new Date("2026-09-04T08:00:00.000Z");
const active = {
  id: 10,
  startedAt: startAt,
  pausedAt: null,
  endedAt: null,
  status: "active" as const,
  pausedSeconds: 0,
};
```

Casos obrigatórios:

```ts
expect(resolveWorkShiftTransition(null, "start", startAt)).toMatchObject({
  mode: "create",
  eventType: "started",
  session: { status: "active", startedAt: startAt, pausedSeconds: 0, workedSeconds: 0 },
});

const pauseAt = new Date("2026-09-04T10:00:00.000Z");
const resumeAt = new Date("2026-09-04T10:15:30.000Z");
const resumed = resolveWorkShiftTransition({ ...active, status: "paused", pausedAt: pauseAt }, "resume", resumeAt);
expect(resumed.sessionPatch).toEqual({ status: "active", pausedAt: null, pausedSeconds: 930 });

const endAt = new Date("2026-09-04T12:00:00.000Z");
const ended = resolveWorkShiftTransition({ ...active, pausedSeconds: 930 }, "end", endAt);
expect(ended.sessionPatch.workedSeconds).toBe(13470); // 14400 - 930

const endWhilePaused = resolveWorkShiftTransition({
  ...active,
  status: "paused",
  pausedAt: new Date("2026-09-04T11:45:00.000Z"),
  pausedSeconds: 300,
}, "end", endAt);
expect(endWhilePaused.sessionPatch.pausedSeconds).toBe(1200);
expect(endWhilePaused.sessionPatch.workedSeconds).toBe(13200);
```

Também exigir erro para `pause` sem sessão, `start` com sessão aberta e `resume` fora de pausa.

Run:

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftDomain.test.ts
```

Expected: **FAIL** por módulo/função ausente.

### 1.2 GREEN — tipos compartilhados

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

### 1.3 GREEN — domínio explícito e tipado

Em `server/workShiftDomain.ts`, criar:

```ts
export type OpenWorkShiftSnapshot = {
  id: number;
  startedAt: Date;
  pausedAt: Date | null;
  endedAt: Date | null;
  status: "active" | "paused";
  pausedSeconds: number;
};

export type WorkShiftSessionPatch = {
  status: "active" | "paused" | "ended" | "cancelled";
  pausedAt?: Date | null;
  endedAt?: Date;
  pausedSeconds?: number;
  workedSeconds?: number;
};

export type WorkShiftLegacyPatch = {
  shiftStartedAt?: Date;
  shiftEndsAt?: Date | null;
  shiftPausedAt?: Date | null;
  shiftPausedTotalSeconds?: number;
};
```

`resolveWorkShiftTransition(current, action, now)` deve:
- `start`: criar sessão `active`, zerar pausas e devolver patch legado de início;
- `pause`: exigir `active` e definir `pausedAt`;
- `resume`: exigir `paused`, somar segundos da pausa corrente e limpar `pausedAt`;
- `end`: aceitar `active`/`paused`, somar pausa corrente se houver e persistir `workedSeconds = max(0, elapsed - pausedSeconds)`.

### 1.4 GREEN + regressão

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftDomain.test.ts server/teamShift.test.ts
```

Expected: PASS.

Commit:

```bash
git add shared/workShifts.ts server/workShiftDomain.ts server/workShiftDomain.test.ts
git commit -m "feat(d007): add historical work shift domain"
```

---

## Task 2 — Schema histórico e migration somente gerada

**Files**
- Modify: `drizzle/schema.ts`
- Create: migration/snapshot gerados pelo Drizzle
- Create: `server/workShiftSchema.test.ts`

### 2.1 RED — tabelas e nulabilidade

Criar teste usando a API de configuração de tabela, evitando inspeção frágil de propriedades internas:

```ts
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { workShiftEvents, workShiftSessions } from "../drizzle/schema";

function column(table: Parameters<typeof getTableConfig>[0], name: string) {
  const found = getTableConfig(table).columns.find(item => item.name === name);
  if (!found) throw new Error(`Coluna ausente: ${name}`);
  return found;
}

describe("D-007A schema", () => {
  it("expõe as tabelas históricas", () => {
    expect(getTableName(workShiftSessions)).toBe("work_shift_sessions");
    expect(getTableName(workShiftEvents)).toBe("work_shift_events");
  });

  it("mantém usuário obrigatório e equipe opcional", () => {
    expect(column(workShiftSessions, "user_id").notNull).toBe(true);
    expect(column(workShiftSessions, "team_id").notNull).toBe(false);
    expect(column(workShiftSessions, "started_at").notNull).toBe(true);
    expect(column(workShiftSessions, "paused_seconds").notNull).toBe(true);
  });
});
```

Run:

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftSchema.test.ts
```

Expected: **FAIL** porque as tabelas não existem.

### 2.2 GREEN — enums e tabelas

Adicionar ao schema:

```ts
export const workShiftSessionStatusEnum = mysqlEnum("work_shift_session_status", ["active", "paused", "ended", "cancelled"]);
export const workShiftSourceEnum = mysqlEnum("work_shift_source", ["self", "supervisor", "admin", "migration", "system"]);
```

Adicionar `workShiftSessions` depois de `users`:

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
```

Adicionar `workShiftEvents`:

```ts
export const workShiftEvents = mysqlTable(
  "work_shift_events",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("session_id").notNull().references(() => workShiftSessions.id, { onDelete: "restrict" }),
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

Não adicionar `scheduleAssignmentId`, `scheduledStartAt` ou `scheduledEndAt` na D-007A; entram com as FKs da D-007B.

### 2.3 Gerar migration sem aplicar

```bash
DATABASE_URL='mysql://root:plan-only@127.0.0.1:3306/dispatch_plan' \
  corepack pnpm exec drizzle-kit generate --name d007a_work_shift_history
```

Expected: gerar a próxima migration (esperada `0003_...sql`) e metadata. **Não executar migrate/db:push.**

### 2.4 Acrescentar catálogo RBAC usando colunas reais

O schema atual de `access_permissions` usa `code`, `resource`, `action`, `description`, `active` — não possui `name`.

Adicionar ao SQL gerado:

```sql
INSERT INTO `access_permissions` (`code`, `resource`, `action`, `description`, `active`)
VALUES
  ('work_shifts.view', 'work_shifts', 'view', 'Consulta a própria jornada e histórico autorizado.', true),
  ('work_shifts.control', 'work_shifts', 'control', 'Inicia, pausa, retoma e encerra a própria jornada.', true)
ON DUPLICATE KEY UPDATE
  `resource` = VALUES(`resource`),
  `action` = VALUES(`action`),
  `description` = VALUES(`description`),
  `active` = VALUES(`active`);
```

Não inserir nada em `role_permissions`.

### 2.5 GREEN

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftSchema.test.ts
corepack pnpm check
```

Expected: PASS.

Commit:

```bash
git add drizzle/schema.ts drizzle/0003* drizzle/meta server/workShiftSchema.test.ts
git commit -m "feat(d007): add work shift history schema"
```

---

## Task 3 — Serviço transacional independente de Drizzle

**Files**
- Create: `server/workShiftService.ts`
- Create: `server/workShiftService.test.ts`

### 3.1 RED — fake store

Criar fake `WorkShiftStore` e testes para `start`, `pause`, `resume`, `end`, inclusive ausência de `teamId`.

Casos mínimos:
- `start` cria sessão, exatamente um evento `started` e espelho legado quando há equipe;
- sem `teamId`, nenhum `mirrorTeam`;
- `pause/resume/end` atualizam a sessão existente e registram exatamente um evento;
- `end` preserva o `workedSeconds` calculado pelo domínio.

Run:

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftService.test.ts
```

Expected: **FAIL** por módulo/função ausente.

### 3.2 GREEN — tipos de store específicos

Em `server/workShiftService.ts`, usar tipos específicos, sem `Record<string, unknown>` para patches de sessão:

```ts
import type { WorkShiftAction, WorkShiftEventType, WorkShiftSource } from "../shared/workShifts";
import type { OpenWorkShiftSnapshot, WorkShiftLegacyPatch, WorkShiftSessionPatch } from "./workShiftDomain";

export type WorkShiftCreateSession = {
  userId: number;
  teamId: number | null;
  source: WorkShiftSource;
  startedAt: Date;
  pausedAt: null;
  endedAt: null;
  status: "active";
  pausedSeconds: number;
  workedSeconds: number;
};

export type WorkShiftEventSnapshot = Record<string, string | number | boolean | null>;

export type WorkShiftStore = {
  getOpenSession(userId: number): Promise<OpenWorkShiftSnapshot | null>;
  createSession(input: WorkShiftCreateSession): Promise<{ id: number }>;
  updateSession(sessionId: number, patch: WorkShiftSessionPatch): Promise<void>;
  appendEvent(input: {
    sessionId: number;
    eventType: WorkShiftEventType;
    actorUserId: number;
    occurredAt: Date;
    beforeData: WorkShiftEventSnapshot | null;
    afterData: WorkShiftEventSnapshot | null;
  }): Promise<void>;
  mirrorTeam(teamId: number, patch: WorkShiftLegacyPatch): Promise<void>;
};
```

### 3.3 Snapshots serializáveis

Adicionar helper puro que converte `Date` para ISO antes de persistir em JSON:

```ts
export function snapshotOpenSession(value: OpenWorkShiftSnapshot | null): WorkShiftEventSnapshot | null {
  if (!value) return null;
  return {
    id: value.id,
    startedAt: value.startedAt.toISOString(),
    pausedAt: value.pausedAt?.toISOString() ?? null,
    endedAt: value.endedAt?.toISOString() ?? null,
    status: value.status,
    pausedSeconds: value.pausedSeconds,
  };
}
```

Criar helper equivalente para o estado `afterData`, nunca gravando objetos `Date` crus no snapshot JSON.

### 3.4 Orquestração

`executeOwnWorkShiftAction(store, { userId, teamId, action, now? })` deve:
1. obter sessão aberta;
2. chamar `resolveWorkShiftTransition`;
3. criar ou atualizar a sessão;
4. anexar exatamente um evento com snapshots sanitizados;
5. espelhar `teams.*shift*` se `teamId !== null`;
6. retornar `{ sessionId, eventType }`.

### 3.5 GREEN

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftDomain.test.ts server/workShiftService.test.ts
```

Expected: PASS.

Commit:

```bash
git add server/workShiftService.ts server/workShiftService.test.ts
git commit -m "feat(d007): orchestrate historical work shift actions"
```

---

## Task 4 — Adapter Drizzle transacional e histórico próprio

**Files**
- Modify: `server/db.ts`
- Create: `server/workShiftDbContract.test.ts`

### 4.1 RED — invariantes estruturais locais

Criar teste que verifique em `server/db.ts`:
- `controlOwnWorkShift` existe;
- usa `db.transaction`;
- executa `.for("update")` no usuário antes da decisão;
- usa `executeOwnWorkShiftAction`;
- persiste `workShiftSessions`/`workShiftEvents`;
- espelha por `tx.update(teams)`.

Esse teste estrutural não substitui integração MySQL; ele garante no gate local que a proteção de concorrência não seja removida inadvertidamente.

Run:

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShiftDbContract.test.ts
```

Expected: FAIL.

### 4.2 GREEN — consultas

Adicionar:

```ts
export async function getOwnCurrentWorkShift(userId: number) {
  const db = await requireDb();
  return (
    await db.select().from(workShiftSessions)
      .where(and(eq(workShiftSessions.userId, userId), inArray(workShiftSessions.status, ["active", "paused"])))
      .orderBy(desc(workShiftSessions.startedAt))
      .limit(1)
  )[0] ?? null;
}

export async function listOwnWorkShiftHistory(input: { userId: number; page: number; pageSize: number }) {
  const db = await requireDb();
  const where = eq(workShiftSessions.userId, input.userId);
  const [rows, totalRows] = await Promise.all([
    db.select().from(workShiftSessions).where(where).orderBy(desc(workShiftSessions.startedAt))
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(workShiftSessions).where(where),
  ]);
  return { rows, total: Number(totalRows[0]?.total ?? 0) };
}
```

### 4.3 GREEN — lock por usuário e store Drizzle

`controlOwnWorkShift` deve:

```ts
export async function controlOwnWorkShift(input: {
  userId: number;
  teamId: number | null;
  action: WorkShiftAction;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const lockedUser = await tx.select({ id: users.id }).from(users)
      .where(eq(users.id, input.userId)).limit(1).for("update");
    if (!lockedUser[0]) throw new Error("Usuário não encontrado.");

    // Construir WorkShiftStore usando SOMENTE `tx`.
    // `getOpenSession` ocorre depois do lock do usuário.
    // `createSession`, `updateSession`, `appendEvent` e `mirrorTeam`
    // permanecem na mesma transaction.

    return executeOwnWorkShiftAction(store, input);
  });
}
```

No adapter:
- `getOpenSession` retorna somente `active|paused`;
- `createSession` usa `$returningId()`;
- `updateSession` recebe `WorkShiftSessionPatch` tipado diretamente, sem `as any`;
- `appendEvent` persiste snapshots serializáveis;
- `mirrorTeam` usa `WorkShiftLegacyPatch` e não toca `teams.status`.

### 4.4 GREEN + tipagem

```bash
corepack pnpm vitest run --config vitest.config.ts \
  server/workShiftDomain.test.ts \
  server/workShiftService.test.ts \
  server/workShiftDbContract.test.ts \
  server/teamShift.test.ts
corepack pnpm check
```

Expected: PASS.

Commit:

```bash
git add server/db.ts server/workShiftDbContract.test.ts
git commit -m "feat(d007): persist own work shift history transactionally"
```

---

## Task 5 — Router tRPC e RBAC específico

**Files**
- Modify: `server/routers.ts`
- Create: `server/workShifts.router.test.ts`
- Modify: `server/accessControl.test.ts`

### 5.1 RED — contratos de autoatendimento

Basear mocks no padrão de `server/triageAndShift.router.test.ts`. Exigir:
- `workShifts.current()` chama `assertPermission(..., "work_shifts.view")` e consulta `ctx.user.id`;
- `workShifts.history({ page, pageSize })` usa `work_shifts.view` e força `userId` do contexto;
- `workShifts.control({ action })` usa `work_shifts.control` e passa `{ userId: ctx.user.id, teamId: ctx.user.teamId, action }`;
- input de `control` não possui campos para timestamps/user/team.

Run:

```bash
corepack pnpm vitest run --config vitest.config.ts server/workShifts.router.test.ts
```

Expected: FAIL porque `workShifts` ainda não existe.

### 5.2 GREEN — router

Importar `WORK_SHIFT_ACTIONS` e adicionar:

```ts
workShifts: router({
  current: operationalProcedure.query(async ({ ctx }) => {
    await assertPermission(ctx.user, "work_shifts.view");
    return getOwnCurrentWorkShift(ctx.user.id);
  }),
  history: operationalProcedure.input(paginationInput).query(async ({ ctx, input }) => {
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

### 5.3 RBAC sem grant legado implícito

Adicionar em `server/accessControl.test.ts`:

```ts
it("reconhece jornada dinâmica sem conceder control ao agente legado", () => {
  expect(evaluatePermission({
    active: true,
    operationalRole: "agente",
    hasDynamicAssignments: true,
    dynamicPermissions: ["work_shifts.view", "work_shifts.control"],
  }, "work_shifts.control")).toBe(true);

  expect(evaluatePermission({
    active: true,
    operationalRole: "agente",
    hasDynamicAssignments: false,
    dynamicPermissions: [],
  }, "work_shifts.control")).toBe(false);

  expect(evaluatePermission({
    active: true,
    operationalRole: "administrador",
    hasDynamicAssignments: false,
    dynamicPermissions: [],
  }, "work_shifts.control")).toBe(true);
});
```

### 5.4 GREEN + regressão do endpoint legado

```bash
corepack pnpm vitest run --config vitest.config.ts \
  server/workShifts.router.test.ts \
  server/accessControl.test.ts \
  server/triageAndShift.router.test.ts
```

Expected: PASS.

Commit:

```bash
git add server/routers.ts server/workShifts.router.test.ts server/accessControl.test.ts
git commit -m "feat(d007): expose own work shift API with RBAC"
```

---

## Task 6 — Inventário tRPC e compatibilidade legada

**Files**
- Modify: `scripts/generate-trpc-coverage.mjs`
- Generated/Modify: `docs/TRPC_CONTRACT_COVERAGE.md`
- Modify: `server/teamShift.test.ts`

### 6.1 RED — gerador percebe a nova superfície

Antes de alterar o script:

```bash
corepack pnpm contracts:coverage
```

Expected: FAIL por contagem inesperada e/ou raiz `workShifts` sem regra.

### 6.2 GREEN — classificar `workShifts`

Adicionar:

```js
{
  prefix: "workShifts",
  suites: [
    "server/workShifts.router.test.ts",
    "server/workShiftDomain.test.ts",
    "server/workShiftService.test.ts",
  ],
  evidence: "Jornada individual histórica: current, history, start/pause/resume/end, RBAC e máquina de estados.",
},
```

A base aprovada tem 97 procedimentos. Três novos procedimentos levam a 100; antes de editar a asserção, contar a superfície atual do próprio `server/routers.ts`. Se houver outra mudança intencional concorrente, documentar o motivo e usar a contagem real — não mascarar divergência.

Atualização esperada:

```js
if (procedures.length !== 100) {
  throw new Error(`Superfície tRPC inesperada: ${procedures.length} procedimentos encontrados; eram esperados 100.`);
}
```

### 6.3 Reforçar compatibilidade legada

Em `server/teamShift.test.ts`, manter e reforçar que `resolveTeamShiftAction` continua funcional na transição D-007A. `server/triageAndShift.router.test.ts` já cobre o `teams.updateShift`; só modificar se o teste existente deixar de provar essa compatibilidade.

### 6.4 Regenerar

```bash
corepack pnpm contracts:coverage
corepack pnpm vitest run --config vitest.config.ts \
  server/teamShift.test.ts \
  server/triageAndShift.router.test.ts \
  server/workShifts.router.test.ts
```

Expected: PASS e markdown contém `workShifts.current`, `workShifts.history`, `workShifts.control`.

Se o gerador possuir números de arquivos/testes hardcoded e já defasados, atualizá-los somente após observar a saída real de `pnpm test` na Task 7.

Commit:

```bash
git add scripts/generate-trpc-coverage.mjs docs/TRPC_CONTRACT_COVERAGE.md server/teamShift.test.ts server/triageAndShift.router.test.ts
git commit -m "test(d007): cover work shift API and legacy compatibility"
```

---

## Task 7 — Gate completo, evidência e checkpoint

**Files**
- Modify: `todo.md`
- Create: `docs/D-007A-WORK-SHIFT-HISTORY-EVIDENCE.md`

### 7.1 Testes direcionados finais

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

### 7.2 Gate equivalente à Qualidade

```bash
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

Expected: todos exit code 0. Registrar quantidades reais da suíte, sem copiar números históricos.

### 7.3 Revisão destrutiva da migration

```bash
git diff checkpoint/d006e-csp-frame-src-20260904 -- \
  drizzle/schema.ts drizzle/0003* drizzle/meta
```

Exigir:
- somente criação de `work_shift_sessions`, `work_shift_events`, índices/FKs e catálogo das duas permissões;
- nenhum `DROP TABLE`, `DROP COLUMN` ou alteração destrutiva;
- nenhum grant em `role_permissions`;
- nenhum dado operacional real;
- FK de `work_shift_events.session_id` não pode apagar a trilha por cascade.

### 7.4 Atualizar roadmap sem antecipar fases

Adicionar:

```md
## D-007 — Controle de Jornada de Trabalho

- [x] D-007A — domínio histórico de sessão/eventos de jornada individual.
- [x] D-007A — compatibilidade `teams.*shift*` sem alterar status operacional automaticamente.
- [x] D-007A — `workShifts.current`, `workShifts.history` e `workShifts.control` com RBAC específico.
- [x] D-007A — catálogo `work_shifts.view` e `work_shifts.control` sem grants automáticos.
- [ ] D-007B — escalas fixas/cíclicas, 12x36, associações e exceções.
- [ ] D-007C — elegibilidade por jornada antes do ranking GIS/despacho.
- [ ] D-007D — ajustes, administração, relatórios e alertas.
```

### 7.5 Documento de evidência

Criar `docs/D-007A-WORK-SHIFT-HISTORY-EVIDENCE.md` contendo:
- escopo entregue;
- tabelas/contratos;
- regra de concorrência (lock do usuário);
- eventos append-only;
- compatibilidade legado;
- RBAC sem grants automáticos;
- escopo explicitamente adiado;
- declaração de que migration não foi aplicada, sem merge/deploy;
- SHA e runs reais somente depois dos gates.

Commit documental inicial:

```bash
git add todo.md docs/D-007A-WORK-SHIFT-HISTORY-EVIDENCE.md
git commit -m "docs(d007): record D-007A historical shift evidence"
```

### 7.6 PR Draft

Abrir PR para `main`:

```text
D-007A: fundação histórica do controle de jornada
```

Body deve declarar: sem merge/deploy; migration apenas gerada/revisada; permissões catalogadas sem grants; D-007B/C/D fora do escopo.

### 7.7 CI no mesmo SHA

Exigir:
- `Qualidade`: success;
- `GIS visual homologation`: success;
- `NEO workspace visual homologation`: success;
- `NEO external compatibility`: success.

D-007A não cria workflow visual próprio porque não altera UI.

Se qualquer gate falhar, investigar antes de classificar como flake.

### 7.8 Evidência final e revalidação

Se inserir run IDs/digests no documento criar novo SHA, repetir os quatro gates nesse SHA. Só depois criar o checkpoint.

### 7.9 Checkpoint imutável

Criar:

```text
checkpoint/d007a-work-shift-history-20260904
```

apontando para o **FINAL_GREEN_SHA**. Não mover o checkpoint depois de criado.

---

## Acceptance Checklist D-007A

- [ ] Sessões encerradas permanecem consultáveis após jornadas futuras.
- [ ] `start` não cria duas sessões abertas sob concorrência serializada pelo usuário.
- [ ] `pause/resume/end` rejeitam estados incompatíveis.
- [ ] Múltiplas pausas acumulam corretamente.
- [ ] `end` durante pausa inclui a pausa corrente no cálculo.
- [ ] Cada ação grava exatamente um evento correspondente.
- [ ] Snapshots de evento são serializáveis e usam datas ISO, não objetos `Date` crus.
- [ ] A API de controle não aceita `userId`, `teamId` ou timestamp arbitrário.
- [ ] Espelho legado ocorre somente quando a sessão possui `teamId`.
- [ ] Transições da nova jornada não alteram `teams.status`.
- [ ] `teams.updateShift` e testes existentes permanecem verdes.
- [ ] `work_shifts.view` e `work_shifts.control` existem no catálogo sem grants automáticos.
- [ ] Administrador legado `*` permanece compatível.
- [ ] Eventos não são apagados por cascade da sessão.
- [ ] `contracts:coverage` reconhece os três novos procedimentos.
- [ ] Security, TypeScript, suíte completa e build passam.
- [ ] GIS/NEO permanecem verdes.
- [ ] Migration foi apenas gerada/revisada; não aplicada em produção.
- [ ] Checkpoint final aponta para SHA com todos os gates verdes.

## Explicitamente adiado

**D-007B:** `work_shift_schedules`, `work_shift_assignments`, `work_shift_schedule_exceptions`, timezone, `cycleAnchorAt`, 12x36, sobreposição e planejamento.

**D-007C:** `evaluateDispatchEligibility`, motivos `outside_shift`/`shift_paused`, integração antes de `rankTeamCandidates`, região/localização/status operacional.

**D-007D:** `work_shift_adjustments`, aprovação/rejeição, relatórios, exportações, alertas e administração do histórico.
