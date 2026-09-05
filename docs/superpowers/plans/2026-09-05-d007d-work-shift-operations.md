# D-007D Work Shift Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a camada operacional D-007D com anomalias, pendências persistentes, SLA/escalonamento, ajustes auditáveis e integração com elegibilidade/Despacho usando eventos + verificação periódica.

**Architecture:** Modelo 2 híbrido. Eventos reais de jornada alimentam imediatamente o detector; um scanner periódico detecta eventos esperados ausentes e anomalias temporais. A D-007D reutiliza os contratos existentes D-007A/B/C e o Motor de Eventos, mantendo canais externos desacoplados e fail-safe.

**Tech Stack:** TypeScript, Node.js, tRPC, Drizzle ORM/MySQL, Vitest, React/Vite, infraestrutura existente de RBAC/eventos/CI.

**Spec:** `docs/superpowers/specs/2026-09-05-d007d-work-shift-operations-design.md`

## Global Constraints

- Base lógica: checkpoint D-007C `081ce9cd24a330ef5321c716282ff79469e80b66`.
- Não duplicar regras D-007A/B/C nem criar Motor de Eventos privado.
- Autorização, tenant e escopo sempre server-side; cliente não é fonte de autoridade.
- Notificação interna não depende de NEO/e-mail/SMS/webhook/push.
- Ajuste de jornada exige justificativa e before/after auditável.
- Resolução de pendência não apaga a anomalia original.
- SLA/retenção/escalonamento são políticas configuráveis, não constantes rígidas.
- Migração D-007D deve ser versionada, mas não aplicada automaticamente em banco real.
- TDD RED -> GREEN -> regressão; commits pequenos; checkpoints por marco.
- Modelo 3 permanece backlog do módulo transversal Workflow/Automação.

---

## File Structure

**Create**
- `drizzle/0005_d007d_work_shift_operations.sql` — persistência D-007D.
- `server/workShiftOperationsDomain.ts` — tipos, severidade, estados, transições e dedupe keys.
- `server/workShiftOperationsDomain.test.ts` — regras puras.
- `server/workShiftAnomalyService.ts` — detector por evento e scanner temporal.
- `server/workShiftAnomalyService.test.ts` — RED/GREEN do Modelo 2.
- `server/workShiftOperationsStore.ts` — adapter Drizzle para pendências/políticas/auditoria.
- `server/workShiftOperationsStore.test.ts` — contrato de persistência.
- `server/workShiftOperationsRuntime.ts` — composição runtime, idempotência, notificações e escalonamento.
- `server/workShiftOperationsRuntime.test.ts` — integração sem canais externos obrigatórios.
- `server/workShiftOperationsRouter.test.ts` — contratos tRPC/RBAC/escopo.
- `client/src/pages/WorkShiftOperations.tsx` — workspace supervisor.
- `client/src/pages/WorkShiftOperations.test.tsx` — estados principais do workspace.
- `docs/D-007D-WORK-SHIFT-OPERATIONS-EVIDENCE.md` — evidências finais.

**Modify**
- `drizzle/workShiftSchema.ts` — tabelas/exports D-007D seguindo padrão D-007A/B.
- `server/workShiftService.ts` — publicar evento operacional depois de persistir evento D-007A, sem alterar a máquina de estados existente.
- `server/routers.ts` — expor router D-007D conforme padrão existente.
- `server/authorization.ts` e catálogo RBAC existente — permissões `work_shift_operations.view` e `work_shift_operations.manage`, sem grant automático.
- `client/src/App.tsx` e navegação existente — rota/workspace D-007D.

---

### Task 1: Modelo persistente e domínio de pendências

**Files:**
- Create: `drizzle/0005_d007d_work_shift_operations.sql`
- Create: `server/workShiftOperationsDomain.ts`
- Create: `server/workShiftOperationsDomain.test.ts`
- Modify: `drizzle/workShiftSchema.ts`

**Interfaces:**
- Produces: `WorkShiftAnomalyType`, `WorkShiftAnomalySeverity`, `WorkShiftPendingStatus`, `buildWorkShiftPendingDedupeKey()`, `transitionWorkShiftPending()`.

- [ ] **Step 1: escrever testes RED do domínio** cobrindo estados `open`, `in_review`, `waiting_information`, `resolved`, `no_adjustment_required`; exigir justificativa nos dois estados terminais; rejeitar transição de terminal para aberto; gerar dedupe key estável por `tenantId:userId:anomalyType:referenceId:windowKey`.
- [ ] **Step 2: executar** `pnpm vitest run server/workShiftOperationsDomain.test.ts` e confirmar FAIL por módulo ausente.
- [ ] **Step 3: implementar o domínio mínimo** com enums/unions explícitas e funções puras; sem acesso ao banco.
- [ ] **Step 4: adicionar schema/migração** para `work_shift_pending_items`, `work_shift_pending_history`, `work_shift_sla_policies` e `work_shift_retention_policies`; incluir `tenant_id`, dedupe unique key, severidade, esperado/observado JSON, SLA timestamps, actor/responsável, justificativa, version para concorrência otimista e timestamps.
- [ ] **Step 5: executar** teste de domínio + `pnpm check` e confirmar PASS.
- [ ] **Step 6: commit** `feat: add D-007D pending domain and schema`.

### Task 2: Detector por eventos — primeira metade do Modelo 2

**Files:**
- Create: `server/workShiftAnomalyService.ts`
- Create: `server/workShiftAnomalyService.test.ts`
- Modify: `server/workShiftService.ts`

**Interfaces:**
- Consumes: snapshots/eventos D-007A e planejamento snapshot D-007B.
- Produces: `detectEventAnomalies(input): WorkShiftAnomalyCandidate[]` e `publishWorkShiftOperationalEvent(event): Promise<void>`.

- [ ] **Step 1: escrever testes RED** para início atrasado, término antecipado, overtime e pausa excessiva; evento normal retorna lista vazia.
- [ ] **Step 2: executar** `pnpm vitest run server/workShiftAnomalyService.test.ts` e confirmar FAIL.
- [ ] **Step 3: implementar detector puro** usando timestamps/snapshots já persistidos; nenhuma re-resolução histórica da escala.
- [ ] **Step 4: integrar `workShiftService.ts`** para publicar evento operacional somente após persistência bem-sucedida do evento da jornada; falha do consumidor deve ser observável/reprocessável e não corromper a sessão.
- [ ] **Step 5: executar** testes D-007A/D-007B relacionados e o novo teste; confirmar PASS.
- [ ] **Step 6: commit** `feat: detect D-007D anomalies from work shift events`.

### Task 3: Scanner periódico — rede de segurança do Modelo 2

**Files:**
- Modify: `server/workShiftAnomalyService.ts`
- Modify: `server/workShiftAnomalyService.test.ts`
- Create/Modify: arquivo de scheduler/runtime existente identificado durante execução, sem criar segundo scheduler se já houver infraestrutura compartilhada.

**Interfaces:**
- Produces: `scanExpectedWorkShiftAnomalies({ tenantId, now }): Promise<WorkShiftAnomalyCandidate[]>`.

- [ ] **Step 1: escrever testes RED**: escala iniciou e não há sessão -> `missing_start`; escala terminou com sessão aberta -> `missing_end`; pausa ultrapassou política -> `excessive_pause`; execução repetida produz mesma dedupe key.
- [ ] **Step 2: executar** teste focado e confirmar FAIL.
- [ ] **Step 3: implementar scanner** consultando planejamento D-007B e estado real D-007A; usar `now` injetável e timezone do planejamento.
- [ ] **Step 4: ligar ao scheduler compartilhado** com intervalo configurável e lock/idempotência por tenant; não executar correções automáticas.
- [ ] **Step 5: executar** testes focados + regressão de planejamento/eligibilidade.
- [ ] **Step 6: commit** `feat: add periodic D-007D anomaly safety scan`.

### Task 4: Persistência idempotente, SLA e retenção

**Files:**
- Create: `server/workShiftOperationsStore.ts`
- Create: `server/workShiftOperationsStore.test.ts`
- Modify: `server/workShiftOperationsRuntime.ts` (create if absent)

**Interfaces:**
- Produces: `upsertPendingFromAnomaly()`, `getEffectiveSlaPolicy()`, `getEffectiveRetentionPolicy()`, `listOperationalPendings()`.

- [ ] **Step 1: escrever RED** para duas entregas do mesmo evento gerarem uma pendência; severidades distintas resolverem SLA por tenant/tipo; ausência de override usar política default; retenção retornar política, nunca apagar auditoria.
- [ ] **Step 2: executar** teste e confirmar FAIL.
- [ ] **Step 3: implementar adapter Drizzle** com unique dedupe key e operação transacional; persistir `dueAt` calculado da política efetiva.
- [ ] **Step 4: implementar concorrência otimista** por `version`; update com versão obsoleta deve falhar explicitamente.
- [ ] **Step 5: executar** testes + `pnpm check`.
- [ ] **Step 6: commit** `feat: persist D-007D pendings with SLA policies`.

### Task 5: Notificação interna e escalonamento desacoplado

**Files:**
- Create/Modify: `server/workShiftOperationsRuntime.ts`
- Create: `server/workShiftOperationsRuntime.test.ts`
- Reuse: infraestrutura de eventos/notificações existente identificada no repositório.

**Interfaces:**
- Produces: `processWorkShiftAnomaly()`, `evaluatePendingEscalations({ tenantId, now })`.

- [ ] **Step 1: escrever RED** comprovando criação da pendência + notificação interna; falha de adapter externo não desfaz pendência; SLA vencido cria escalonamento apenas uma vez por nível.
- [ ] **Step 2: executar** teste e confirmar FAIL.
- [ ] **Step 3: implementar runtime** com outbox/evento compartilhado ou padrão equivalente já existente; external adapters recebem evento, não são chamados como dependência transacional da pendência.
- [ ] **Step 4: implementar níveis configuráveis** Supervisor -> Gestor -> nível tenant; nenhuma ação altera automaticamente a jornada.
- [ ] **Step 5: executar** testes de runtime e eventos.
- [ ] **Step 6: commit** `feat: notify and escalate D-007D pendings`.

### Task 6: Ajuste humano, auditoria e reflexo na elegibilidade

**Files:**
- Modify: `server/workShiftOperationsRuntime.ts`
- Modify: `server/workShiftOperationsRuntime.test.ts`
- Reuse/Modify: serviços D-007A e D-007C somente pelos contratos públicos existentes.

**Interfaces:**
- Produces: `resolvePendingWithAdjustment()` e `resolvePendingWithoutAdjustment()`.

- [ ] **Step 1: escrever RED**: ajuste sem justificativa rejeitado; before/after preservados; `no_adjustment_required` exige justificativa; resolução mantém anomalia original; após ajuste a elegibilidade é recalculada pelo caminho D-007C.
- [ ] **Step 2: executar** e confirmar FAIL.
- [ ] **Step 3: implementar comando transacional** com actor, timestamp, before/after e history append-only.
- [ ] **Step 4: publicar evento de mudança** para consumidores e invalidar/recalcular estado operacional sem executar GIS/OSRM diretamente.
- [ ] **Step 5: executar** testes D-007A/C + novos testes.
- [ ] **Step 6: commit** `feat: add audited D-007D journey adjustments`.

### Task 7: tRPC, RBAC, tenant e escopo Supervisor/Admin

**Files:**
- Create: `server/workShiftOperationsRouter.test.ts`
- Modify: `server/routers.ts`
- Modify: `server/authorization.ts` e catálogo de permissões existente.

**Interfaces:**
- Produces procedures: `workShiftOperations.list`, `summary`, `claim`, `setStatus`, `resolveWithAdjustment`, `resolveWithoutAdjustment`, `slaPolicies.list`, `slaPolicies.upsert`.

- [ ] **Step 1: escrever RED**: sem `work_shift_operations.view` não lista; Supervisor só vê/atua em equipes server-side do próprio escopo; Admin global; `manage` obrigatório para mutações; tenant cruzado sempre negado.
- [ ] **Step 2: executar** teste e confirmar FAIL.
- [ ] **Step 3: catalogar permissões** `work_shift_operations.view/manage` sem grant automático.
- [ ] **Step 4: implementar router** chamando runtime/store; IDs de equipe enviados pelo cliente são filtros, nunca prova de escopo.
- [ ] **Step 5: executar** testes de authorization/router + inventário tRPC existente.
- [ ] **Step 6: commit** `feat: expose scoped D-007D operations API`.

### Task 8: Workspace Supervisor integrado e destacável

**Files:**
- Create: `client/src/pages/WorkShiftOperations.tsx`
- Create: `client/src/pages/WorkShiftOperations.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: navegação/workspace compartilhado existente, sem implementar framework multi-monitor privado.

**Interfaces:**
- Consumes: `workShiftOperations.list/summary` e mutações autorizadas.

- [ ] **Step 1: escrever RED** para counters, críticas/vencidas destacadas, filtros equipe/período/status, estados loading/error/empty, ação de abrir/tratar pendência e permissão somente leitura.
- [ ] **Step 2: executar** teste de UI e confirmar FAIL.
- [ ] **Step 3: implementar workspace** responsivo, reutilizando shell/layout da Central; expor contrato para abertura destacável quando infraestrutura comum estiver disponível.
- [ ] **Step 4: garantir que falha NEO/iframe não afete Jornada** e que alertas críticos continuem visíveis.
- [ ] **Step 5: executar** testes UI + regressão `App`/Dashboard/NEO workspace.
- [ ] **Step 6: commit** `feat: add D-007D supervisor workspace`.

### Task 9: Evidências, regressão e checkpoint

**Files:**
- Create: `docs/D-007D-WORK-SHIFT-OPERATIONS-EVIDENCE.md`
- Modify only if required: CI inventories/tests already used by D-007C.

**Interfaces:**
- Produces: evidência auditável da homologação D-007D.

- [ ] **Step 1: executar instalação frozen** `pnpm install --frozen-lockfile`.
- [ ] **Step 2: executar verificação de segurança existente** exatamente pelo comando do workflow `quality.yml`.
- [ ] **Step 3: executar** `pnpm check`.
- [ ] **Step 4: executar suíte completa** `pnpm test` (ou comando exato definido no `package.json` se diferente) e registrar total/pass/fail.
- [ ] **Step 5: executar build** `pnpm build`.
- [ ] **Step 6: confirmar regressão dos quatro gates** Quality, GIS visual, NEO external compatibility e NEO workspace visual homologation no SHA final.
- [ ] **Step 7: escrever evidence** com SHAs RED/GREEN, migração apenas versionada/não aplicada, permissões apenas catalogadas/não concedidas automaticamente, inventário tRPC, testes e limitações.
- [ ] **Step 8: commit** `docs: add D-007D verification evidence`.
- [ ] **Step 9: criar checkpoint imutável** `checkpoint/d007d-work-shift-operations-20260905` somente no SHA que possuir todos os gates verdes; não mergear/deployar automaticamente.

## Backlog preservado

Modelo 3: motor transversal de Regras/Workflow configurável para condições, temporizadores, SLA, ações e automações encadeadas. Não implementar dentro da D-007D. A operação real alimentará novas features preservando contratos do Modelo 2.
