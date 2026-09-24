# D-012F — Eventos e Gatilhos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consumir eventos autorizados e versionados do Despacho, D-008 e Inventário para iniciar ou avançar Workflows com deduplicação persistente por `tenantId + eventId`, preservação de `correlationId` e comportamento fail-closed.

**Architecture:** Reusar o envelope D-012A, os produtores/outboxes existentes e o runtime D-012C/D-012E. A D-012F adiciona somente adapters de entrada, recibo persistente de consumo e um serviço de gatilho que localiza workflows/instâncias elegíveis e delega as mudanças ao runtime existente; não cria novo barramento, nova outbox de Formulários nem escrita cruzada em domínios externos.

**Tech Stack:** TypeScript 5.9, Vitest 2, Zod 4, Drizzle ORM 0.45/MySQL, pnpm 10.

**Spec:** `docs/superpowers/specs/2026-09-13-d012-workflow-automation-design.md`

## Global Constraints

- Tenant/organização sempre derivado do contexto autenticado ou envelope confiável; nunca de campo arbitrário do cliente.
- Eventos externos possuem `eventId` e versão para idempotência/fail-closed.
- Replays não podem produzir efeito duplicado.
- Toda transição registra ator, origem, destino, timestamp e `correlationId`.
- Sem consultas/escritas cruzadas em bancos de outros produtos.
- Sem scripts, SQL, shell, URL arbitrária ou plugin remoto.
- Estado crítico de Ocorrência não é alterado automaticamente pela D-012F.
- Reusar `form_domain_events`, o consumidor M15/Inventário, o catálogo versionado de integrações e o runtime D-012 existente; não duplicar essas estruturas.
- Nenhum deploy, migration ou merge produtivo automático.

---

### Task 1: Autorizar e adaptar eventos externos ao envelope D-012A

**Files:**
- Modify: `shared/workflowIntegration/v1.ts`
- Create: `server/workflow/workflowEventAdapters.ts`
- Create: `server/workflow/workflowEventAdapters.test.ts`
- Modify: `server/workflowIntegrationContract.test.ts`

**Interfaces:**
- Consumes: `FormDomainEvent` de `server/forms/formEvents.ts` e `AssetInventoryEvent` de `server/assetInventoryEventConsumer.ts`.
- Produces: `adaptFormEventToWorkflowEnvelope(event, correlationId)`, `adaptInventoryEventToWorkflowEnvelope(event)`, `adaptDispatchEventToWorkflowEnvelope(event)` retornando `WorkflowEventEnvelope` validado.

- [ ] **Step 1: Escrever testes RED** cobrindo `incident.created.v1`, `incident.status_changed.v1`, `form.submission.submitted.v1`, `form.submission.corrected.v1`, `inventory.asset.created.v1` e `inventory.asset.updated.v1`, incluindo produtor incompatível, envelope v2 e tipo não autorizado.
- [ ] **Step 2: Executar** `pnpm vitest run server/workflowIntegrationContract.test.ts server/workflow/workflowEventAdapters.test.ts` e confirmar falha pelas novas expectativas.
- [ ] **Step 3: Implementar o mínimo**: estender as allowlists do contrato e criar adapters que apenas transformam eventos já pertencentes aos domínios de origem; o adapter de Despacho recebe um DTO explícito, nunca lê tabela operacional diretamente.
- [ ] **Step 4: Reexecutar os testes** e confirmar GREEN.
- [ ] **Step 5: Commit** `feat(workflow): adapt authorized domain events`.

### Task 2: Persistir recibos de consumo por tenant + eventId

**Files:**
- Create: `server/workflow/workflowEventReceiptSchema.ts`
- Create: `server/workflow/workflowEventReceiptStore.ts`
- Create: `server/workflow/workflowEventReceiptStore.test.ts`
- Modify: `drizzle.config.ts`
- Create: `drizzle/0013_d012f_workflow_event_receipts.sql`

**Interfaces:**
- Produces: `claimWorkflowEventReceipt(tx, envelope)` e `completeWorkflowEventReceipt(tx, input)`.
- Chave única: `(tenant_id, event_id)`; armazena `event_type`, `producer`, `correlation_id`, `status`, `workflow_execution_id`, `processed_at`, `failure_code`.

- [ ] **Step 1: Escrever teste RED** que prove primeiro consumo, replay no mesmo tenant, mesmo `eventId` em tenant diferente e registro de falha sem efeito duplicado.
- [ ] **Step 2: Executar** `pnpm vitest run server/workflow/workflowEventReceiptStore.test.ts` e confirmar RED.
- [ ] **Step 3: Criar schema + migration aditiva** com unique `(tenant_id,event_id)` e índices para `status/created_at` e `correlation_id`.
- [ ] **Step 4: Implementar store fail-closed**: conflito de chave retorna `duplicate`; nenhum replay executa side effect novamente.
- [ ] **Step 5: Reexecutar teste** e confirmar GREEN.
- [ ] **Step 6: Commit** `feat(workflow): persist event consumption receipts`.

### Task 3: Iniciar Workflow por evento autorizado

**Files:**
- Modify: `server/workflow/workflowInstanceStateMachine.ts`
- Modify: `server/workflow/workflowInstancePersistence.ts`
- Create: `server/workflow/workflowEventTriggerService.ts`
- Create: `server/workflow/workflowEventTriggerService.test.ts`
- Modify: `server/workflow/workflowInstanceStateMachine.test.ts`

**Interfaces:**
- Produces: `consumeWorkflowEvent(envelope, actorUserId)`.
- O start por evento congela `workflowVersionId`, tenant e `correlationId`, usa `triggerType=event:<eventType>` e `idempotencyKey=<tenantId>:<eventId>`.
- Matching inicial usa somente workflow ativo/publicado do mesmo tenant e trigger autorizado na definição; não consulta tabelas dos produtos de origem.

- [ ] **Step 1: Escrever teste RED**: evento autorizado inicia exatamente uma instância do workflow compatível; evento sem trigger é `ignored`; evento de outro tenant não casa; replay é `duplicate`; versão/tipo inválido falha antes de persistir efeito.
- [ ] **Step 2: Executar** `pnpm vitest run server/workflow/workflowEventTriggerService.test.ts server/workflow/workflowInstanceStateMachine.test.ts` e confirmar RED.
- [ ] **Step 3: Generalizar somente o start do runtime** para aceitar `trigger.manual` ou `trigger.external_data`, preservando o wrapper manual existente para compatibilidade.
- [ ] **Step 4: Implementar serviço transacional**: validar envelope → claim receipt → localizar workflow elegível → iniciar instância → completar receipt; qualquer divergência de tenant/versionamento fecha a operação.
- [ ] **Step 5: Reexecutar testes** e confirmar GREEN.
- [ ] **Step 6: Commit** `feat(workflow): start instances from authorized events`.

### Task 4: Avançar instâncias aguardando evento

**Files:**
- Modify: `server/dbLegacy.ts`
- Modify: `server/workflow/workflowInstanceStateMachine.ts`
- Modify: `server/workflow/workflowInstancePersistence.ts`
- Modify: `server/workflow/workflowEventTriggerService.ts`
- Modify: `server/workflow/workflowEventTriggerService.test.ts`
- Modify: `server/workflow/workflowInstanceStateMachine.test.ts`

**Interfaces:**
- Novo nó runtime: `wait.event` com `configuration.eventType` pertencente à allowlist D-012A.
- Uma instância só avança quando seu nó atual `wait.event` corresponde exatamente ao `eventType`, dentro do mesmo tenant; o destino é a única saída permitida ou falha fechado se ambíguo.

- [ ] **Step 1: Escrever teste RED** para espera por evento, evento incorreto ignorado, tenant divergente rejeitado, duas saídas ambíguas rejeitadas e replay sem segundo avanço.
- [ ] **Step 2: Executar** os testes focados e confirmar RED.
- [ ] **Step 3: Autorizar `wait.event` na validação da definição**, exigindo tipo de evento válido e exatamente uma saída na versão publicada.
- [ ] **Step 4: Adicionar transição de retomada por evento** ao state machine sem reutilizar a regra específica de tarefa humana.
- [ ] **Step 5: Integrar no consumer** preservando o mesmo `correlationId` e receipt; nenhum evento altera diretamente Ocorrência/Formulário/Ativo.
- [ ] **Step 6: Reexecutar testes** e confirmar GREEN.
- [ ] **Step 7: Commit** `feat(workflow): advance waiting instances by event`.

### Task 5: Hardening, arquitetura e regressão da D-012F

**Files:**
- Create: `server/workflow/workflowEventArchitecture.test.ts`
- Create: `docs/architecture/d012f-workflow-events-triggers.md`
- Modify: `server/db.ts` somente se export público interno for necessário.

**Interfaces:**
- Architecture tests impedem import/escrita direta de Formulários/Inventário/Ocorrência pelo consumer de Workflow e impedem nova fila/outbox D-012F para eventos desses domínios.

- [ ] **Step 1: Escrever teste arquitetural** que fixa os limites de dependência e o fail-closed de tipos/produtores/versões.
- [ ] **Step 2: Documentar** fluxo, allowlist, deduplicação, rollback da migration e fora de escopo.
- [ ] **Step 3: Executar** `pnpm security:check`.
- [ ] **Step 4: Executar** `pnpm check`.
- [ ] **Step 5: Executar** `pnpm test`.
- [ ] **Step 6: Executar** `pnpm build`.
- [ ] **Step 7: Revisar diff contra `main`** e confirmar ausência de UI/deploy/mudança automática de estado crítico.
- [ ] **Step 8: Commit** `test(workflow): harden D-012F event triggers` e abrir PR como Draft para revisão; merge somente após aprovação explícita.
