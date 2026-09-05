# D-007D — Operação, Alertas e Gestão da Jornada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar observabilidade operacional da jornada, cobertura configurável, alertas, ajustes auditáveis e contingência humana temporária sem enfraquecer a elegibilidade D-007C.

**Architecture:** D-007D compõe D-007A/B/C, sem reimplementar planejamento ou elegibilidade normal. Serviços de domínio puros calculam cobertura, alertas e validade de contingência; adapters Drizzle persistem políticas/eventos/autorizações; routers tRPC aplicam RBAC e escopo server-side; o despacho aplica uma contingência válida somente após a elegibilidade normal e preserva snapshot auditável antes do GIS/OSRM.

**Tech Stack:** TypeScript, Node.js, tRPC, Zod, Drizzle ORM/MySQL, Vitest, React/Vite existente.

**Spec:** `docs/superpowers/specs/2026-09-05-d007d-work-shift-operations-design.md`

## Global Constraints

- Base imutável: `checkpoint/d007c-dispatch-work-shift-eligibility-20260904` @ `081ce9cd24a330ef5321c716282ff79469e80b66`.
- Fail-closed para autorização, tenant, escopo e dependências críticas.
- Nenhuma contingência promove silenciosamente inelegível para elegível.
- D-007B continua dono de fixed/12x36; D-007C continua dono da elegibilidade normal.
- Ajustes e auditoria preservam histórico; despachos passados nunca são recalculados retroativamente.
- Autoautorização de contingência bloqueada por padrão.
- Toda contingência tem justificativa, início e expiração obrigatórios e pode ser revogada.
- Cliente não é fonte de autoridade para identidade, tenant, membership, perfil ou elegibilidade.
- TDD RED → GREEN → regressão e checkpoint por tarefa.
- Nenhuma migration deve ser aplicada em banco real durante o desenvolvimento.
- PR permanece Draft; sem merge/deploy automático.

---

## File map

**Criar**
- `shared/workShiftOperations.ts` — contratos D-007D: cobertura, alertas, contingência, ajustes e snapshots.
- `server/workShiftCoveragePolicyService.ts` + `.test.ts` — política e cálculo NORMAL/DEGRADED/CRITICAL.
- `server/workShiftOperationalAlertService.ts` + `.test.ts` — detecção/deduplicação/transições de alertas.
- `server/workShiftContingencyService.ts` + `.test.ts` — autorização, validade, expiração/revogação e bloqueio de autoautorização.
- `server/workShiftOperationsDb.ts` + `.test.ts` — adapter Drizzle e transações auditáveis.
- `server/workShiftOperationsRouter.ts` + `.test.ts` — APIs operacionais com RBAC/escopo.
- `server/workShiftOperationsRuntime.ts` + `.test.ts` — wiring real server-side.
- `server/dispatchContingencyService.ts` + `.test.ts` — composição D-007C → D-007D antes do GIS.
- `drizzle/0005_d007d_work_shift_operations.sql` — persistência versionada, nunca executada automaticamente.
- `docs/D-007D-WORK-SHIFT-OPERATIONS-EVIDENCE.md` — evidência auditável final.

**Modificar**
- `drizzle/schema.ts` — tabelas/enums D-007D.
- `server/dispatchRouter.ts` + `.test.ts` — snapshot/contingência sem quebrar contrato legado.
- `server/dispatchRuntime.ts` — injetar resolução D-007D.
- `server/rootRouter.ts` + teste de registro — registrar router operacional.
- `server/accessControl.ts` e catálogo RBAC existente — novas permissões sem grants automáticos.
- `scripts/generate-trpc-coverage.mjs` e teste — inventariar contratos novos.
- `docs/TRPC_CONTRACT_COVERAGE.md` — saída gerada.
- `todo.md` — progresso/checkpoints D-007D.

---

### Task 1: Contratos de domínio e política de cobertura

**Files:**
- Create: `shared/workShiftOperations.ts`
- Create: `server/workShiftCoveragePolicyService.ts`
- Test: `server/workShiftCoveragePolicyService.test.ts`

**Interfaces:**
- Consumes: membros já avaliados por D-007C (`DispatchMemberEligibility[]`).
- Produces: `CoveragePolicy`, `CoverageEvaluation`, `evaluateCoverage(policy, members)`.

- [ ] **Step 1: escrever teste RED** para política com `minimumEligible=2`: 2 elegíveis → `NORMAL`, 1 → `DEGRADED`, 0 → `CRITICAL`; validar também rejeição de mínimo negativo e isolamento do escopo da política.
- [ ] **Step 2: executar** `pnpm vitest run server/workShiftCoveragePolicyService.test.ts`; esperado: FAIL porque contratos/serviço não existem.
- [ ] **Step 3: implementar contratos mínimos** com `CoverageState = "NORMAL" | "DEGRADED" | "CRITICAL"`, `CoveragePolicy { id, organizationId, organizationalUnitId?, teamId?, startsAtMinute, endsAtMinute, minimumEligible, active }` e `CoverageEvaluation { state, minimumEligible, eligibleCount, deficit }`.
- [ ] **Step 4: implementar `evaluateCoverage`** puro: `eligibleCount >= minimumEligible => NORMAL`; `eligibleCount > 0 => DEGRADED`; senão `CRITICAL`; validar política antes do cálculo.
- [ ] **Step 5: executar teste + regressão D-007C**: `pnpm vitest run server/workShiftCoveragePolicyService.test.ts server/dispatchEligibilityService.test.ts`.
- [ ] **Step 6: commit/checkpoint** `feat: add D-007D coverage domain` e `checkpoint/d007d-task1-coverage-domain-20260905`.

### Task 2: Persistência de políticas, alertas, contingências, ajustes e auditoria

**Files:**
- Modify: `drizzle/schema.ts`
- Create: `drizzle/0005_d007d_work_shift_operations.sql`
- Create: `server/workShiftOperationsDb.ts`
- Test: `server/workShiftOperationsDb.test.ts`

**Interfaces:**
- Consumes: `CoveragePolicy` e contratos de `shared/workShiftOperations.ts`.
- Produces: `WorkShiftOperationsRepository` com leitura de política ativa, persistência/transição de alerta, criação/revogação de contingência, append de ajuste e snapshot.

- [ ] **Step 1: escrever RED** verificando queries tenant-aware e que criação de contingência exige `expiresAt > startsAt`, justificativa não vazia e actor diferente do target quando `allowSelfAuthorization=false`.
- [ ] **Step 2: executar** `pnpm vitest run server/workShiftOperationsDb.test.ts`; esperado FAIL.
- [ ] **Step 3: adicionar schema/migration** para `work_shift_coverage_policies`, `work_shift_operational_alerts`, `work_shift_contingencies`, `work_shift_adjustments` e `dispatch_eligibility_snapshots`, todos com índices de organização/escopo/estado/tempo e FKs existentes quando aplicável.
- [ ] **Step 4: implementar repository** usando transações para ajuste + `auditLogs` e para contingência + auditoria; não atualizar/destruir ajuste histórico.
- [ ] **Step 5: executar** teste do adapter e `pnpm check`; esperado PASS.
- [ ] **Step 6: confirmar por revisão** que migration está apenas versionada e não foi executada.
- [ ] **Step 7: commit/checkpoint** `feat: persist D-007D operational controls` e `checkpoint/d007d-task2-persistence-20260905`.

### Task 3: Alertas operacionais e deduplicação

**Files:**
- Create: `server/workShiftOperationalAlertService.ts`
- Test: `server/workShiftOperationalAlertService.test.ts`

**Interfaces:**
- Consumes: planejamento/realizado, `CoverageEvaluation`, relógio injetado.
- Produces: `deriveOperationalAlerts(input)` e `deduplicateOperationalAlerts(existing, derived)`.

- [ ] **Step 1: RED** para atraso, não iniciado, pausa excessiva, término próximo, jornada excedida, cobertura degradada/crítica e falha técnica; testar chave de deduplicação por organização+escopo+tipo+janela.
- [ ] **Step 2: executar** teste específico; esperado FAIL.
- [ ] **Step 3: implementar severidades** `info|warning|high|critical`, causas estruturadas e chave determinística; reconhecimento não muda `resolvedAt`.
- [ ] **Step 4: implementar deduplicação** mantendo alerta aberto existente e anexando `lastObservedAt`; resolução automática somente quando condição deixa de existir.
- [ ] **Step 5: executar** suíte Task 3 + Tasks 1/2.
- [ ] **Step 6: commit/checkpoint** `feat: add D-007D operational alerts` e `checkpoint/d007d-task3-alerts-20260905`.

### Task 4: Serviço de contingência humana temporária

**Files:**
- Create: `server/workShiftContingencyService.ts`
- Test: `server/workShiftContingencyService.test.ts`

**Interfaces:**
- Produces: `authorizeContingency(input)`, `resolveActiveContingency(input)`, `revokeContingency(input)`.

- [ ] **Step 1: RED** para justificativa obrigatória, expiração futura, escopo/tenant, autoautorização bloqueada, revogação, expiração e sobreposição conflitante.
- [ ] **Step 2: executar** teste; esperado FAIL.
- [ ] **Step 3: implementar validação pura**; uma contingência só é aplicável quando `state=active`, `startsAt <= now < expiresAt`, mesmo tenant/escopo e não revogada.
- [ ] **Step 4: implementar resolução fail-closed**: erro/ambiguidade/sobreposição incompatível retorna nenhuma autorização aplicável e razão estruturada.
- [ ] **Step 5: executar** suíte Task 4 + regressões.
- [ ] **Step 6: commit/checkpoint** `feat: add temporary work shift contingency` e `checkpoint/d007d-task4-contingency-20260905`.

### Task 5: RBAC e router operacional

**Files:**
- Modify: `server/accessControl.ts` e catálogo de permissões existente
- Create: `server/workShiftOperationsRouter.ts`
- Test: `server/workShiftOperationsRouter.test.ts`
- Modify: `server/rootRouter.ts`
- Test: teste de root router existente/novo.

**Interfaces:**
- Procedures: `workShiftOperations.dashboard`, `.coverage`, `.alerts`, `.acknowledgeAlert`, `.adjustShift`, `.authorizeContingency`, `.revokeContingency`, `.history`.

- [ ] **Step 1: RED** para procedures e permissões `work_shift_operations.view`, `work_shift_alerts.acknowledge`, `work_shift_adjustments.manage`, `work_shift_contingencies.authorize`, `work_shift_coverage_policies.manage`; provar que admin base não bypassa permissão operacional.
- [ ] **Step 2: executar** testes router/root; esperado FAIL.
- [ ] **Step 3: catalogar permissões** sem grant automático e implementar router com `protectedProcedure`, `assertPermission` e asserts de organização/equipe server-side.
- [ ] **Step 4: validar payloads Zod**: IDs positivos, justificativa trim/min, timestamps coerentes, limites de paginação e ausência de flags autoritativas do cliente.
- [ ] **Step 5: registrar no `rootRouter`** sem alterar procedures D-007A/B/C.
- [ ] **Step 6: executar** testes RBAC/router/root e regressão de acesso.
- [ ] **Step 7: commit/checkpoint** `feat: expose D-007D operations API` e `checkpoint/d007d-task5-api-rbac-20260905`.

### Task 6: Runtime real e ajustes append-only

**Files:**
- Create: `server/workShiftOperationsRuntime.ts`
- Test: `server/workShiftOperationsRuntime.test.ts`

**Interfaces:**
- Consumes repository Task 2, serviços Tasks 1/3/4 e contexto de acesso existente.
- Produces dependências reais para `createWorkShiftOperationsRouter`.

- [ ] **Step 1: RED** demonstrando carga server-side de membership/tenant, ajuste com before/after, justificativa e auditoria, e falha técnica fail-closed.
- [ ] **Step 2: executar** teste; esperado FAIL.
- [ ] **Step 3: implementar runtime** sem confiar em membership/role recebido do cliente; relógio injetável nos serviços.
- [ ] **Step 4: garantir append-only**: correção cria evento de ajuste/auditoria e atualiza somente a projeção operacional necessária, preservando registro anterior.
- [ ] **Step 5: executar** Task 6 + work shift regressions D-007A/B.
- [ ] **Step 6: commit/checkpoint** `feat: wire D-007D operations runtime` e `checkpoint/d007d-task6-runtime-20260905`.

### Task 7: Composição contingência → despacho → snapshot → GIS

**Files:**
- Create: `server/dispatchContingencyService.ts`
- Test: `server/dispatchContingencyService.test.ts`
- Modify: `server/dispatchRouter.ts`
- Test: `server/dispatchRouter.test.ts`
- Modify: `server/dispatchRuntime.ts`

**Interfaces:**
- Consumes: resultado normal D-007C e contingências D-007D válidas.
- Produces: partição efetiva + `DispatchEligibilitySnapshot` persistível antes de `rankTeamCandidates`.

- [ ] **Step 1: RED** provando que inelegível normal permanece fora do GIS sem contingência; contingência válida pode autorizar explicitamente o escopo; expirada/revogada/ambígua não autoriza; snapshot registra normalReason + contingencyId/actor/reason/validity.
- [ ] **Step 2: executar** testes serviço/router; esperado FAIL.
- [ ] **Step 3: implementar composição** sem modificar `resolveDispatchMemberEligibility`; aplicar exceção depois da D-007C e antes de `rankTeamCandidates`.
- [ ] **Step 4: persistir snapshot** antes do ranking; se persistência necessária ao fundamento auditável falhar, não encaminhar candidato excepcional ao GIS (fail-closed).
- [ ] **Step 5: preservar `gis.rankCandidates` legado** e resposta compatível de `dispatch.rankEligibleCandidates`, adicionando metadados de forma não destrutiva.
- [ ] **Step 6: executar** D-007C + GIS/OSRM regressions.
- [ ] **Step 7: commit/checkpoint** `feat: apply audited contingencies before GIS` e `checkpoint/d007d-task7-dispatch-contingency-20260905`.

### Task 8: Inventário tRPC, evidência e homologação final

**Files:**
- Modify: `scripts/generate-trpc-coverage.mjs`
- Modify/Test: `server/trpcCoverageGenerator.test.ts`
- Modify: `docs/TRPC_CONTRACT_COVERAGE.md`
- Create: `docs/D-007D-WORK-SHIFT-OPERATIONS-EVIDENCE.md`
- Modify: `todo.md`

**Interfaces:**
- Produces inventário auditável e checkpoint final D-007D.

- [ ] **Step 1: RED** exigindo todos os novos contratos no inventário tRPC e totais coerentes.
- [ ] **Step 2: executar** `pnpm vitest run server/trpcCoverageGenerator.test.ts`; esperado FAIL antes da atualização do gerador/evidência.
- [ ] **Step 3: atualizar gerador/documentação** e registrar matriz requisito→teste→checkpoint para Tasks 1–7.
- [ ] **Step 4: executar verificação completa fresca**: segurança definida em `package.json`/workflow, `pnpm check`, `pnpm test`, `pnpm build`; registrar contagens e SHA reais, sem antecipar números.
- [ ] **Step 5: disparar/confirmar gates** Qualidade, GIS visual homologation, NEO external compatibility e NEO workspace visual homologation no mesmo SHA documental final.
- [ ] **Step 6: somente com todos os gates verdes**, atualizar evidência/todo como concluído e criar `checkpoint/d007d-work-shift-operations-20260905` apontando para o SHA homologado.
- [ ] **Step 7: manter PR Draft**, sem merge/deploy/migration real/grants automáticos.

---

## Self-review do plano

- Cobertura da spec: painel/cobertura → Tasks 1/5/6; persistência/auditoria → 2/6; alertas → 3; contingência → 4; RBAC/API → 5; composição com despacho/snapshot → 7; testes/evidência/gates → 8.
- Invariantes D-007A/B/C preservados: nenhum serviço existente de planejamento/elegibilidade é substituído.
- Segurança: autoridade server-side, autoautorização bloqueada, fail-closed e tenant/scope aparecem em Tasks 2/4/5/6/7.
- Sem placeholders deliberados: cada tarefa possui arquivos, interfaces, RED, GREEN, regressão e checkpoint.
- Números de testes/contratos não são inventados; serão registrados somente após execução fresca na Task 8.
