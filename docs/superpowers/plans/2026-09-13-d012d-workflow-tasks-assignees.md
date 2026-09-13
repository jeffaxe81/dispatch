# D-012D — Tarefas e Responsáveis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** adicionar tarefas humanas à engine D-012C sem criar uma segunda engine.

**Architecture:** `workflow_executions` continua sendo a instância. `workflow_tasks` é filha da execução e congela `workflow_version_id` e `node_id`. O domínio fica em `workflowTaskStateMachine.ts`, a persistência em `workflowTaskPersistence.ts` e a integração com a instância permanece transacional em `workflowInstancePersistence.ts`.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM/MySQL, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-13-d012-workflow-automation-design.md`

## Refinamentos confirmados durante implementação

- A tabela nova usa schema dedicado `server/workflow/workflowTaskSchema.ts`, registrado no `drizzle.config.ts`.
- Não foi criado o tipo `task.human`; nós já suportados recebem `configuration.requiresHumanTask=true`, preservando compatibilidade com o validador legado.
- `assigneeUserId` é opcional; tarefa sem responsável pode ser assumida por claim.
- Nó humano terminal pode concluir a instância no próprio nó após a tarefa ser concluída.
- Não existe cancelamento público isolado de tarefa. `cancelled` ocorre quando a instância é cancelada, evitando uma instância órfã em `waiting`.
- O SQL da migration `0011` continua obrigatório antes do merge/deploy e permanece pendente enquanto a escrita DDL estiver bloqueada pelo conector.

## Global Constraints

- Estados: `open`, `in_progress`, `completed`, `cancelled`.
- Responsável deste corte: `assigneeUserId`; equipe/papel e RBAC formal ficam para ciclo posterior.
- `claim` só sobre tarefa aberta sem responsável; concorrência falha fechado.
- `start` e `complete` exigem o usuário atualmente atribuído.
- Uma tarefa obrigatória aberta/em andamento bloqueia o avanço normal da instância.
- Cancelar a instância cancela tarefas não terminais na mesma transação.
- `(executionId,nodeId)` é único para impedir duplicação lógica.
- Sem SLA, notificações, eventos externos, D-008, UI/Kanban, deploy ou migration produtiva automática.

### Task 1 — Schema e migration

**Files:** `server/workflow/workflowTaskSchema.test.ts`, `server/workflow/workflowTaskSchema.ts`, `drizzle.config.ts`, `drizzle/0011_d012d_workflow_tasks.sql`.

- [x] Schema Drizzle isolado com FKs, estados, timestamps, chave única e índices.
- [x] Schema incluído no `drizzle.config.ts`.
- [x] Teste estrutural impede criação de `workflow_instances`.
- [ ] Versionar migration física `0011_d012d_workflow_tasks.sql` — bloqueio conhecido do conector.

### Task 2 — Máquina de estados pura

**Files:** `server/workflow/workflowTaskStateMachine.test.ts`, `server/workflow/workflowTaskStateMachine.ts`.

- [x] create, assign/reassign, claim, start, complete e cancel do domínio.
- [x] Estados terminais imutáveis.
- [x] Ownership funcional em start/complete.
- [x] Metadados de correlação/auditoria produzidos pelo domínio.

### Task 3 — Persistência e auditoria

**Files:** `server/workflow/workflowTaskPersistence.test.ts`, `server/workflow/workflowTaskPersistence.ts`, `server/db.ts`.

- [x] Versão copiada da `workflow_execution` congelada, nunca de `currentVersion`.
- [x] Criação idempotente por execução+nó, protegida também pela chave única de schema.
- [x] assign/claim/start/complete transacionais e auditados.
- [x] Claim usa locking de linha e falha fechado em corrida.
- [x] APIs seguras expostas pela fachada existente.

### Task 4 — Integração com a instância

**Files:** `workflowInstanceStateMachine.test.ts`, `workflowInstanceStateMachine.ts`, `workflowTaskInstanceIntegration.test.ts`, `workflowInstancePersistence.ts`.

- [x] Nó com `requiresHumanTask=true` leva a instância para `waiting`.
- [x] Avanço normal de instância `waiting` falha fechado.
- [x] Tarefa é criada/recuperada na mesma transação da entrada no nó humano.
- [x] Retomada exige tarefa `completed` da mesma execução, versão e nó.
- [x] Próxima aresta continua validada pela versão congelada.
- [x] Etapa humana terminal conclui a instância sem nó artificial.

### Task 5 — Cancelamento e arquitetura

**Files:** `workflowTaskArchitecture.test.ts`, `workflowInstancePersistence.ts`, `docs/architecture/d012d-workflow-tasks-assignees.md`.

- [x] Cancelar instância cancela tarefas `open`/`in_progress` na mesma transação.
- [x] Cada cancelamento de tarefa gera auditoria.
- [x] Cancelamento isolado de tarefa não é exposto.
- [x] Testes arquiteturais impedem segunda engine, HTTP, Ocorrências e adaptadores externos.
- [x] Rollout/rollback e limites documentados.

### Task 6 — Gates finais

**Files:** `docs/superpowers/reports/2026-09-13-d012d-workflow-tasks-assignees-verification.md`.

- [ ] Qualidade/TypeScript/testes/build/Docker GREEN no HEAD final.
- [ ] Compatibilidade/visual gates GREEN no HEAD final.
- [ ] Migration `0011` versionada.
- [ ] Relatório de verificação final.
- [ ] PR permanece Draft até todos os gates acima; merge requer aprovação explícita separada.
