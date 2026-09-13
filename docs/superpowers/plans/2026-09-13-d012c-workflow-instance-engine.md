# D-012C — Engine de Instâncias e Máquina de Estados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o workflow existente para uma instância stateful, presa à versão publicada no momento do início, com início manual, avanço somente por arestas válidas, conclusão/cancelamento controlados e auditoria correlacionada, sem tarefas e sem automações externas.

**Architecture:** D-012C reutiliza `workflow_executions` como persistência da `WorkflowInstance`; não cria segundo motor nem tabela concorrente. A lógica de transição fica em um módulo puro `server/workflow/workflowInstanceStateMachine.ts`; a persistência adiciona somente `current_node_id` e `correlation_id` às execuções. O executor legado de `SIMULAÇÃO / MOCK` continua funcionando e não é convertido automaticamente para a nova engine.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM/MySQL, pnpm/Corepack, audit log existente do AXE Dispatch.

**Spec:** `docs/superpowers/specs/2026-09-13-d012-workflow-automation-design.md`

## Global Constraints

- Base funcional: `feat/d012b-workflow-definition-version` @ `a021d068f0728603d79f995fa917a3fcafa4452c`; integração em `main` continua dependente da aprovação explícita da D-012B/PR #103.
- Reutilizar `workflow_executions`/`workflow_execution_steps`; não criar `workflow_instances` ou um segundo engine concorrente.
- Cada nova instância congela `workflowVersionId` da `publishedVersion`; edição/publicação posterior não muda instância em andamento.
- D-012C não cria `WorkflowTask`, assignee, claim ou inbox; isso pertence à D-012D.
- D-012C não formaliza RBAC/isolamento multi-tenant do engine; isso pertence à D-012E. O ator continua vindo de contexto autenticado nas superfícies existentes.
- D-012C não consome eventos externos, não faz deduplicação persistente de eventos e não cria gatilhos; isso pertence à D-012F.
- Nenhuma etapa executa HTTP, SQL configurável, shell, plugin remoto ou efeito externo. Nenhum estado crítico de Ocorrência é alterado.
- O modo de persistência continua `simulacao` nesta microentrega para tornar explícito que não existe automação produtiva externa.
- Toda transição nova registra `actorUserId`, origem, destino, timestamp e `correlationId` no audit log.
- Transição inexistente, instância terminal, versão ausente ou definição inconsistente falha fechado sem alterar a linha.
- TDD RED → GREEN em cada mudança funcional.
- Migration é apenas versionada; não aplicar em ambiente nem executar deploy/grant.
- Merge em `main` somente com aprovação explícita do responsável pelo projeto.

---

## File Structure

**Criar:**
- `server/workflow/workflowInstanceStateMachine.test.ts` — contrato unitário RED→GREEN da máquina de estados.
- `server/workflow/workflowInstanceStateMachine.ts` — domínio puro de início, avanço, conclusão, cancelamento e falha.
- `server/workflow/workflowInstancePersistence.test.ts` — contrato de persistência e imutabilidade da versão congelada.
- `server/workflow/workflowInstancePersistence.ts` — transações de início/avanço/cancelamento usando `workflow_executions`.
- `drizzle/0010_d012c_workflow_instance_state.sql` — migration aditiva de `current_node_id` e `correlation_id`.
- `docs/architecture/d012c-workflow-instance-engine.md` — modelo, coexistência com legado, rollout e rollback.
- `docs/superpowers/reports/2026-09-13-d012c-workflow-instance-engine-verification.md` — evidências finais somente após gates GREEN.

**Modificar:**
- `drizzle/schema.ts` — adicionar projeção persistida mínima da instância em `workflow_executions`.
- `server/db.ts` — exportar as operações D-012C pela fachada sem mover regras para `dbLegacy.ts`.
- testes arquiteturais de Workflow — impedir segundo engine, efeitos externos e regressão da resolução por versão publicada.

**Preservar:**
- `server/workflow/workflowExecutionPersistence.ts` — executor legado simulado; alterações somente se um teste de compatibilidade exigir adaptação estritamente mecânica.
- `client/src/pages/WorkflowBuilderPage.tsx` e `client/src/pages/ExecutionsPage.tsx` — sem UI nova na D-012C.

---

### Task 1: C1 — Máquina de estados pura

**Files:**
- Create: `server/workflow/workflowInstanceStateMachine.test.ts`
- Create: `server/workflow/workflowInstanceStateMachine.ts`

**Interfaces:**
- Produces `WorkflowInstanceStatus = "running" | "waiting" | "completed" | "cancelled" | "failed"`.
- Produces `WorkflowInstanceState` com `workflowId`, `workflowVersionId`, `currentNodeId`, `status`.
- Produces `WorkflowInstanceTransition` com `action`, `fromNodeId`, `toNodeId`, `actorUserId`, `correlationId`, `occurredAt`.
- Produces `startManualWorkflowInstanceState`, `advanceWorkflowInstanceState`, `cancelWorkflowInstanceState` e `failWorkflowInstanceState`.

- [ ] **Step 1: escrever testes RED**

Cobrir, com grafo mínimo `trigger.manual -> notification.simulate`:
1. início fixa `workflowId` e `workflowVersionId` e posiciona no único `trigger.manual`;
2. início falha fechado sem trigger inicial único;
3. avanço aceita somente aresta que parte do `currentNodeId`;
4. avanço para nó sem saída encerra como `completed`;
5. transição inválida não cria novo estado;
6. instância terminal não pode avançar;
7. cancelamento funciona apenas em `running|waiting`;
8. cada resultado contém registro de transição com ator/correlation/timestamp fornecidos pelo chamador.

Run:
```bash
corepack pnpm exec vitest run server/workflow/workflowInstanceStateMachine.test.ts
```
Expected RED: import de `./workflowInstanceStateMachine` ainda inexistente.

- [ ] **Step 2: implementar GREEN mínimo**

O módulo deve validar IDs positivos, `correlationId` não vazio, existência dos nós e arestas. `startManualWorkflowInstanceState` identifica exatamente um nó `trigger.manual` sem entrada. `advanceWorkflowInstanceState` somente aceita `edge.source === currentNodeId && edge.target === targetNodeId`; se o destino não possuir saída, retorna `completed`, caso contrário `running`. Cancel/fail zeram `currentNodeId` somente quando terminalizar não for necessário para auditoria; nesta entrega o último nó permanece preservado.

- [ ] **Step 3: executar suíte focal e regressão de domínio**

Run:
```bash
corepack pnpm exec vitest run server/workflow/workflowInstanceStateMachine.test.ts server/workflow/workflowVersioning.test.ts server/workflow/workflowBoundary.test.ts server/workflowExecutor.test.ts
```
Expected: PASS.

- [ ] **Step 4: commit**

```bash
git add server/workflow/workflowInstanceStateMachine.test.ts server/workflow/workflowInstanceStateMachine.ts
git commit -m "feat: adicionar state machine D-012C"
```

---

### Task 2: C2 — Persistência mínima da posição da instância

**Files:**
- Modify: `drizzle/schema.ts`
- Create: `drizzle/0010_d012c_workflow_instance_state.sql`
- Create: `server/workflow/workflowInstancePersistence.test.ts`

**Interfaces:**
- `workflow_executions.current_node_id VARCHAR(120) NULL`.
- `workflow_executions.correlation_id VARCHAR(160) NULL`.
- Índice `workflow_executions_correlation_idx(correlation_id)`.
- Linhas legadas permanecem válidas com ambos os campos `NULL`.

- [ ] **Step 1: escrever teste RED de schema/migration**

O teste deve verificar que o schema exporta `currentNodeId`/`correlationId` e que a migration é apenas aditiva, sem `DROP`, sem alteração destrutiva e sem mexer em tabelas de Ocorrência.

Run:
```bash
corepack pnpm exec vitest run server/workflow/workflowInstancePersistence.test.ts
```
Expected RED: colunas/migration ainda ausentes.

- [ ] **Step 2: implementar schema e migration**

Migration esperada:
```sql
ALTER TABLE workflow_executions
  ADD COLUMN current_node_id VARCHAR(120) NULL,
  ADD COLUMN correlation_id VARCHAR(160) NULL;

CREATE INDEX workflow_executions_correlation_idx
  ON workflow_executions (correlation_id);
```

- [ ] **Step 3: confirmar GREEN e compatibilidade Drizzle**

Run:
```bash
corepack pnpm exec vitest run server/workflow/workflowInstancePersistence.test.ts
corepack pnpm check
```
Expected: PASS.

- [ ] **Step 4: commit**

```bash
git add drizzle/schema.ts drizzle/0010_d012c_workflow_instance_state.sql server/workflow/workflowInstancePersistence.test.ts
git commit -m "feat: persistir estado mínimo da instância D-012C"
```

---

### Task 3: C3 — Início manual e avanço transacional

**Files:**
- Create: `server/workflow/workflowInstancePersistence.ts`
- Modify: `server/workflow/workflowInstancePersistence.test.ts`
- Modify: `server/db.ts`

**Interfaces:**
- `startManualWorkflowInstance({ workflowId, actorUserId, correlationId, inputData? })`.
- `advanceManualWorkflowInstance({ executionId, targetNodeId, actorUserId, correlationId })`.
- `cancelManualWorkflowInstance({ executionId, actorUserId, correlationId })`.

- [ ] **Step 1: escrever testes RED transacionais**

Cobrir:
1. start exige workflow ativo, `simulationOnly=true` e `publishedVersion` existente;
2. a linha grava exatamente o `workflowVersionId` correspondente à versão publicada;
3. rascunho publicado depois não altera `workflowVersionId` da instância já criada;
4. status persistido mapeia `running -> em_execucao`, `completed -> concluida`, `cancelled -> cancelada`, `failed -> falha`;
5. avanço inválido faz rollback completo;
6. cada start/advance/cancel grava audit log `workflow_instance.start|advance|complete|cancel` com origem/destino/correlationId;
7. nenhuma função toca `incidents`, faz HTTP ou usa executor externo.

- [ ] **Step 2: implementar transações mínimas**

A função de start carrega `publishedVersion`, localiza a linha imutável em `workflow_versions`, valida a definição e chama a state machine pura. A função de avanço recarrega exatamente `workflowVersionId` já gravado na execução e nunca consulta `currentVersion` para decidir a instância em andamento. Toda mutação e auditoria ocorrem na mesma transação.

- [ ] **Step 3: expor pela fachada `server/db.ts`**

Exportar as três funções D-012C sem adicionar lógica de domínio à fachada.

- [ ] **Step 4: rodar regressão focal**

Run:
```bash
corepack pnpm exec vitest run server/workflow/workflowInstancePersistence.test.ts server/workflow/workflowInstanceStateMachine.test.ts server/workflowTransactions.test.ts server/workflowExecutionPersistence.test.ts server/workflowExecutor.test.ts
```
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add server/workflow/workflowInstancePersistence.ts server/workflow/workflowInstancePersistence.test.ts server/db.ts
git commit -m "feat: executar instâncias manuais D-012C"
```

---

### Task 4: C4 — Hardening, arquitetura e documentação

**Files:**
- Create: `docs/architecture/d012c-workflow-instance-engine.md`
- Modify: teste arquitetural de Workflow mais adequado existente
- Create: `docs/superpowers/reports/2026-09-13-d012c-workflow-instance-engine-verification.md`

- [ ] **Step 1: adicionar invariantes arquiteturais**

Provar por teste que:
- não existe nova tabela `workflow_instances`;
- D-012C reutiliza `workflow_executions`;
- `workflowInstancePersistence.ts` não importa módulos HTTP nem tabelas `incidents`;
- instância em andamento resolve a definição por `workflowVersionId`, não por `currentVersion`;
- o executor legado continua marcado como simulação e sem chamadas externas.

- [ ] **Step 2: documentar rollout/rollback**

Rollout futuro: aplicar `0009` antes de `0010`, validar colunas/índice, iniciar aplicação, smoke manual de start/advance/cancel. Rollback: voltar aplicação primeiro; manter colunas aditivas durante estabilização; remoção de índice/colunas somente em manutenção separada e nunca automática.

- [ ] **Step 3: gates finais**

Run:
```bash
corepack pnpm install --frozen-lockfile
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
cp .env.example .env && docker compose config && docker compose build app migrate
```
Expected: todos GREEN; remover `.env` de trabalho ao final.

- [ ] **Step 4: registrar relatório real**

O relatório final deve registrar SHA testado, comandos, resultados reais e limitações. Não declarar GREEN sem saída comprovada.

- [ ] **Step 5: gate de integração**

Abrir/atualizar PR D-012C como Draft até todos os gates ficarem GREEN. Não fazer merge em `main`, deploy, migration real ou grant sem aprovação explícita.
