# D-012D — Tarefas e Responsáveis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** adicionar tarefas humanas à engine D-012C sem criar uma segunda engine.

**Architecture:** `workflow_executions` continua sendo a instância. A nova entidade `workflow_tasks` é filha da execução e congela `workflow_version_id` e `node_id`. O domínio da tarefa fica isolado em `server/workflow/workflowTaskStateMachine.ts`; persistência em `workflowTaskPersistence.ts`; a integração com a instância é mínima e transacional.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM/MySQL, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-13-d012-workflow-automation-design.md`

## Global Constraints

- Estados: `open`, `in_progress`, `completed`, `cancelled`.
- Responsável deste corte: `assigneeUserId`; equipe/papel e RBAC formal ficam para ciclo posterior.
- `claim` só sobre tarefa aberta sem responsável; concorrência falha fechado.
- `start` e `complete` exigem o usuário atualmente atribuído.
- Uma tarefa obrigatória aberta/em andamento bloqueia o avanço da instância.
- Cancelar a instância cancela tarefas não terminais na mesma transação.
- `(executionId,nodeId)` é idempotente: nunca criar duplicata para o mesmo nó da mesma execução.
- Sem SLA, notificações, eventos externos, D-008, UI/Kanban, deploy ou migration produtiva automática.

### Task 1 — Schema e migration

**Files:** create `server/workflow/workflowTaskSchema.test.ts`; modify `drizzle/schema.ts`; create `drizzle/0011_d012d_workflow_tasks.sql`.

- [ ] RED: teste importa `* as schema` e prova que `workflowTasks` ainda não existe.
- [ ] GREEN: adicionar enum/tabela, FKs para execution/version/user, unique `(execution_id,node_id)` e índices por responsável/status e execução/status.
- [ ] Verificar: `pnpm exec vitest run server/workflow/workflowTaskSchema.test.ts --config vitest.config.ts`.

### Task 2 — Máquina de estados pura

**Files:** create `server/workflow/workflowTaskStateMachine.test.ts` e `server/workflow/workflowTaskStateMachine.ts`.

Interfaces: `createWorkflowTaskState`, `assignWorkflowTaskState`, `claimWorkflowTaskState`, `startWorkflowTaskState`, `completeWorkflowTaskState`, `cancelWorkflowTaskState`.

- [ ] RED: lifecycle, concorrência de claim, ator diferente do assignee, terminal imutável, metadados de auditoria.
- [ ] GREEN: implementação mínima imutável com `WorkflowTaskState` e transições auditáveis.
- [ ] Verificar teste focado.

### Task 3 — Persistência e auditoria

**Files:** create `server/workflow/workflowTaskPersistence.test.ts`, `server/workflow/workflowTaskPersistence.ts`; modify `server/db.ts`.

Interfaces: `createWorkflowTask`, `assignWorkflowTask`, `claimWorkflowTask`, `startWorkflowTask`, `completeWorkflowTask`, `cancelWorkflowTask`.

- [ ] RED: versão vem da execução congelada; criação idempotente; mutações persistem e auditam; claim concorrente falha fechado.
- [ ] GREEN: implementar dentro de transações usando `getDb()` e `auditLogs`.
- [ ] Verificar teste focado.

### Task 4 — Integração com a instância

**Files:** modify `workflowInstanceStateMachine.test.ts`, `workflowInstanceStateMachine.ts`, `workflowInstanceTransactions.test.ts`, `workflowInstancePersistence.ts`.

- [ ] RED: `trigger.manual -> task.human -> ...`; ao entrar na tarefa a instância fica `waiting`; avanço direto enquanto tarefa não concluída falha.
- [ ] GREEN: criar/obter a tarefa idempotente ao entrar no nó humano e expor `resumeManualWorkflowInstanceFromCompletedTask` para seguir apenas por aresta válida da versão congelada.
- [ ] Verificar testes D-012C + D-012D.

### Task 5 — Cancelamento e arquitetura

**Files:** create `workflowTaskArchitecture.test.ts`; modify persistência de instância; create `docs/architecture/d012d-workflow-tasks-assignees.md`.

- [ ] RED: cancelamento da instância ainda deixa tarefas abertas e teste arquitetural identifica limites.
- [ ] GREEN: cancelar tarefas não terminais na mesma transação; documentar rollout/rollback e limites.
- [ ] Verificar testes focados.

### Task 6 — Gates finais

**Files:** create `docs/superpowers/reports/2026-09-13-d012d-workflow-tasks-assignees-verification.md`.

- [ ] Rodar testes focados D-012D.
- [ ] Rodar `pnpm run check`, `pnpm run security:check`, `pnpm test`, `pnpm run build`.
- [ ] Confirmar diff restrito ao escopo.
- [ ] Abrir PR em Draft; merge continua dependente de aprovação explícita.