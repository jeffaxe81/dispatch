# D-007D Administration, Reports and Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concluir a D-007 com ajustes auditáveis de jornada, relatórios operacionais, alertas determinísticos e um painel administrativo responsivo sem regressão das fases D-007A/B/C.

**Architecture:** A D-007D será composta por três subdomínios server-side independentes — ajustes, relatórios e alertas — sobre `work_shift_sessions`, `work_shift_events`, escalas/cobertura D-007B e elegibilidade D-007C. O painel administrativo apenas compõe contratos tRPC; nenhuma regra crítica fica no cliente. Cada ciclo D1..D4 fecha em RED→GREEN→regressão→checkpoint.

**Tech Stack:** TypeScript, Node.js, tRPC 11, Drizzle ORM/MySQL, Vitest, React 19, TanStack Query, Vite.

**Spec:** `docs/superpowers/specs/2026-09-04-d007d-admin-reports-alerts-design.md`

## Global Constraints

- Base funcional exclusiva: `checkpoint/d007c-dispatch-work-shift-eligibility-20260904` @ `081ce9cd24a330ef5321c716282ff79469e80b66`.
- Nenhuma edição silenciosa de jornada; correções exigem before/after e eventos auditáveis.
- D-007A continua fonte do realizado; D-007B continua fonte do planejado; D-007C não será refatorada.
- RBAC/escopo sempre resolvidos no servidor.
- Migrations novas são apenas versionadas/testadas; não aplicar em banco real sem autorização explícita.
- Novas permissões entram apenas no catálogo `access_permissions`; nunca conceder `role_permissions` automaticamente.
- Alertas são informativos e determinísticos; sem broker distribuído ou ação destrutiva automática na Release 1.0.
- Fora do escopo: folha, legislação trabalhista completa, banco de horas complexo, eSocial, biometria, autoencerramento de jornada e novos épicos.
- Antes de declarar qualquer ciclo concluído: segurança, TypeScript, Vitest completo, build, GIS visual, NEO external e NEO workspace no mesmo SHA.
- PR funcional permanece Draft; PR técnico de CI contra `main` nunca será mergeado; nenhum deploy/merge sem autorização.

---

## File Structure

### D-007D1 — Ajustes
- Create: `shared/workShiftAdjustments.ts` — contratos estáveis e schemas compartilhados do fluxo de ajuste.
- Create: `server/workShiftAdjustmentService.ts` — regras puras de request/approve/reject/apply e concorrência otimista.
- Create: `server/workShiftAdjustmentService.test.ts`.
- Create: `server/workShiftAdjustmentDbStore.ts` — adapter Drizzle e transação de aplicação.
- Create: `server/workShiftAdjustmentDbStore.test.ts`.
- Create: `server/workShiftAdjustmentsRouter.ts` — tRPC/RBAC/escopo.
- Create: `server/workShiftAdjustmentsRouter.test.ts`.
- Create: `server/workShiftAdjustmentsRuntime.ts` — wiring real.
- Modify: `drizzle/workShiftSchema.ts` — tabela `work_shift_adjustments`.
- Create: `drizzle/0005_d007d_work_shift_adjustments_alerts.sql` — migration conjunta D1/D3, inicialmente com ajustes e permissões D1; ampliar somente em D3 antes do checkpoint final D3.
- Modify: `drizzle/meta/_journal.json`.
- Modify: `server/rootRouter.ts` — registrar `workShiftAdjustments`.

### D-007D2 — Relatórios
- Create: `shared/workShiftReports.ts` — filtros/DTOs.
- Create: `server/workShiftReportService.ts` — agregações puras planejado x realizado.
- Create: `server/workShiftReportService.test.ts`.
- Create: `server/workShiftReportDb.ts` — queries de leitura e escopo.
- Create: `server/workShiftReportDb.test.ts`.
- Create: `server/workShiftReportsRouter.ts`.
- Create: `server/workShiftReportsRouter.test.ts`.
- Create: `server/workShiftReportsRuntime.ts`.
- Modify: `server/rootRouter.ts` — registrar `workShiftReports`.

### D-007D3 — Alertas
- Create: `shared/workShiftAlerts.ts` — tipos, severidade e estados.
- Create: `server/workShiftAlertService.ts` — avaliação/deduplicação/transições.
- Create: `server/workShiftAlertService.test.ts`.
- Create: `server/workShiftAlertDbStore.ts` — persistência e dedupe.
- Create: `server/workShiftAlertDbStore.test.ts`.
- Create: `server/workShiftAlertsRouter.ts`.
- Create: `server/workShiftAlertsRouter.test.ts`.
- Create: `server/workShiftAlertsRuntime.ts`.
- Modify: `drizzle/workShiftSchema.ts` — tabela `work_shift_alerts`.
- Modify: `drizzle/0005_d007d_work_shift_adjustments_alerts.sql` — adicionar alertas/índices/permissões sem grants.
- Modify: `server/rootRouter.ts` — registrar `workShiftAlerts`.

### D-007D4 — Painel e fechamento
- Create: `client/src/pages/WorkShiftAdminPage.tsx` — composição administrativa.
- Create: `client/src/pages/WorkShiftAdminPage.test.tsx`.
- Modify: `client/src/App.tsx` — rota protegida da área de Jornada.
- Modify: `client/src/components/DashboardLayout.tsx` — item de navegação conforme permissões.
- Modify: `scripts/generate-trpc-coverage.mjs` — inventariar novos routers.
- Modify: `server/trpcCoverageGenerator.test.ts`.
- Modify: `docs/TRPC_CONTRACT_COVERAGE.md`.
- Create: `docs/D-007D-WORK-SHIFT-ADMIN-EVIDENCE.md`.
- Modify: `todo.md`.

---

### Task 1: D-007D1 — Contratos e domínio de ajustes auditáveis

**Files:**
- Create: `shared/workShiftAdjustments.ts`
- Create: `server/workShiftAdjustmentService.ts`
- Test: `server/workShiftAdjustmentService.test.ts`

**Interfaces:**
- Consumes: snapshots de `work_shift_sessions` e `WorkShiftEventSnapshot` já existentes.
- Produces:
  - `WorkShiftAdjustmentStatus = "pending" | "approved" | "rejected"`
  - `WorkShiftAdjustmentRequestedChanges`
  - `WorkShiftAdjustmentSnapshot`
  - `requestWorkShiftAdjustment(...)`
  - `approveWorkShiftAdjustment(...)`
  - `rejectWorkShiftAdjustment(...)`

- [ ] **Step 1: Write the failing tests** cobrindo: request cria `pending`; snapshot é server-side; correção permitida de `startedAt`, `endedAt`, `pausedSeconds`, `teamId` e cancelamento; rejeita payload fora da allowlist; aprovação detecta sessão alterada desde `beforeSnapshot`; rejeição não produz patch; approve/reject idempotentes apenas quando repetem a mesma decisão.

```ts
it("fails closed when the session changed after the request", () => {
  const adjustment = requestWorkShiftAdjustment({ session: baseSession, changes: { endedAt: later } });
  expect(() => approveWorkShiftAdjustment(adjustment, changedSession, now)).toThrow(/changed/i);
});
```

- [ ] **Step 2: Run RED**

Run: `corepack pnpm vitest run server/workShiftAdjustmentService.test.ts`
Expected: FAIL because `workShiftAdjustmentService.ts` / exported contracts do not exist.

- [ ] **Step 3: Implement minimal domain** com comparação canônica do snapshot (`id`, timestamps, status, paused/worked/overtime/late/early, team/schedule snapshot) e cálculo server-side do `afterSnapshot`. Nunca aceitar `workedSeconds`, `overtimeSeconds`, `lateStartSeconds` ou `earlyEndSeconds` diretamente do cliente; recalcular valores derivados.

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm vitest run server/workShiftAdjustmentService.test.ts`
Expected: PASS, zero failures.

- [ ] **Step 5: Commit**

```bash
git add shared/workShiftAdjustments.ts server/workShiftAdjustmentService.ts server/workShiftAdjustmentService.test.ts
git commit -m "feat: add audited work shift adjustment domain"
```

### Task 2: D-007D1 — Persistência, migration, router e runtime

**Files:**
- Modify: `drizzle/workShiftSchema.ts`
- Create: `drizzle/0005_d007d_work_shift_adjustments_alerts.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `server/workShiftAdjustmentDbStore.ts`
- Test: `server/workShiftAdjustmentDbStore.test.ts`
- Create: `server/workShiftAdjustmentsRouter.ts`
- Test: `server/workShiftAdjustmentsRouter.test.ts`
- Create: `server/workShiftAdjustmentsRuntime.ts`
- Modify: `server/rootRouter.ts`

**Interfaces:**
- Produces tRPC: `workShiftAdjustments.list`, `.request`, `.approve`, `.reject`.
- Permission mapping: view/list uses `work_shifts.view`; request uses `work_shifts.adjust`; approve/reject uses `work_shifts.approve`; all additionally validate scope da sessão/usuário no servidor.

- [ ] **Step 1: Write RED for schema/store/router**. Exigir tabela `work_shift_adjustments`, migration sem `role_permissions`, transação de aprovação que: lock/re-read sessão, compara `beforeSnapshot`, atualiza sessão, grava ajuste e eventos `adjustment_approved` + `adjusted`. Rejeição grava `adjustment_rejected` e não atualiza sessão.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm vitest run server/workShiftAdjustmentDbStore.test.ts server/workShiftAdjustmentsRouter.test.ts`
Expected: FAIL por store/router/schema ausentes.

- [ ] **Step 3: Implement minimal Drizzle adapter and router**. JSON deve ser sanitizado antes de persistir. `requestedByUserId`/`decidedByUserId` vêm do contexto autenticado. Escopo inválido falha antes da mutação.

- [ ] **Step 4: Add root-router RED then GREEN** verificando que `_def.procedures` contém `workShiftAdjustments.request`, `.approve`, `.reject`, `.list`.

Run: `corepack pnpm vitest run server/workShiftAdjustmentsRouter.test.ts server/workShiftAdjustmentDbStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Full regression and checkpoint D1**

Run: `corepack pnpm security:check && corepack pnpm check && corepack pnpm test && corepack pnpm build`
Expected: all exit 0. Depois executar os quatro workflows remotos no mesmo SHA e criar `checkpoint/d007d1-work-shift-adjustments-20260904` somente se todos verdes.

### Task 3: D-007D2 — Serviço de relatórios planejado x realizado

**Files:**
- Create: `shared/workShiftReports.ts`
- Create: `server/workShiftReportService.ts`
- Test: `server/workShiftReportService.test.ts`

**Interfaces:**
- Consumes: sessões D-007A, snapshots planejados/cobertura D-007B, ajustes aprovados.
- Produces: `WorkShiftReportFilters`, `WorkShiftReportRow`, `WorkShiftReportSummary`, `buildWorkShiftReport(...)`.

- [ ] **Step 1: Write RED** para: planejado x realizado; sessão ativa; sessão sem encerramento; pausa; overtime técnico; atraso; saída antecipada; presença de ajuste; cobertura por faixa; filtros de período/usuário/equipe/status.

```ts
expect(summary).toMatchObject({ plannedSeconds: 43200, workedSeconds: 39600, lateStartSeconds: 900 });
```

- [ ] **Step 2: Run RED**

Run: `corepack pnpm vitest run server/workShiftReportService.test.ts`
Expected: FAIL por serviço ausente.

- [ ] **Step 3: Implement pure report projection**. Nenhum método do serviço pode atualizar banco ou sessão. Para sessões ativas, usar `evaluatedAt` explícito nos testes e `new Date()` somente no runtime.

- [ ] **Step 4: Run GREEN and commit**

Run: `corepack pnpm vitest run server/workShiftReportService.test.ts`
Expected: PASS.

### Task 4: D-007D2 — DB, tRPC, exportação auditada e checkpoint

**Files:**
- Create: `server/workShiftReportDb.ts`
- Test: `server/workShiftReportDb.test.ts`
- Create: `server/workShiftReportsRouter.ts`
- Test: `server/workShiftReportsRouter.test.ts`
- Create: `server/workShiftReportsRuntime.ts`
- Modify: `server/rootRouter.ts`

**Interfaces:**
- Produces tRPC: `workShiftReports.overview`, `.sessions`, `.coverage`, `.export`.
- RBAC: `work_shift_reports.view` para leitura, `work_shift_reports.export` para exportação.

- [ ] **Step 1: Write RED** para escopo organizacional fail-closed, filtros normalizados e exportação auditada sem dados sensíveis no evento/log.
- [ ] **Step 2: Run RED** com `corepack pnpm vitest run server/workShiftReportDb.test.ts server/workShiftReportsRouter.test.ts`.
- [ ] **Step 3: Implement queries/read model and router** reutilizando padrões de exportação/auditoria existentes; não persistir relatório derivado nesta release.
- [ ] **Step 4: Run GREEN**, root-router contract test e suíte D1+D2.
- [ ] **Step 5: Full gates and checkpoint** `checkpoint/d007d2-work-shift-reports-20260904` somente após os quatro workflows verdes no mesmo SHA.

### Task 5: D-007D3 — Domínio e persistência de alertas

**Files:**
- Create: `shared/workShiftAlerts.ts`
- Create: `server/workShiftAlertService.ts`
- Test: `server/workShiftAlertService.test.ts`
- Modify: `drizzle/workShiftSchema.ts`
- Modify: `drizzle/0005_d007d_work_shift_adjustments_alerts.sql`
- Create: `server/workShiftAlertDbStore.ts`
- Test: `server/workShiftAlertDbStore.test.ts`

**Interfaces:**
- Types: `WorkShiftAlertType`, `WorkShiftAlertSeverity`, `WorkShiftAlertStatus`.
- Produces: `evaluateWorkShiftAlerts(context)`, `acknowledgeWorkShiftAlert(...)`, `resolveWorkShiftAlert(...)`.

- [ ] **Step 1: Write RED** para os oito tipos obrigatórios (`SHIFT_NOT_STARTED_NEAR_PLANNED_TIME`, `LATE_START`, `PAUSE_EXCEEDED`, `SHIFT_OVERRUN`, `SHIFT_NOT_ENDED`, `COVERAGE_GAP`, `AVAILABLE_OUTSIDE_SHIFT`, `LEGACY_SHIFT_STATE_DIVERGENCE`) e `DISPATCH_EXCLUDED_BY_SHIFT` apenas quando houver evidência persistível adequada.
- [ ] **Step 2: Add dedupe RED**: mesma `dedupeKey` + condição ainda aberta não cria segundo alerta; condição resolvida pode gerar nova ocorrência futura com nova detecção.
- [ ] **Step 3: Implement minimal deterministic evaluator** sem timers próprios/broker. Limites são parâmetros de policy/runtime e não magic numbers espalhados.
- [ ] **Step 4: Implement table `work_shift_alerts`** com unique/index adequado para dedupe lógico, índices por status/detectedAt/user/team/session e JSON sanitizado.
- [ ] **Step 5: Run GREEN** para service/store e migration test garantindo ausência de grants automáticos.

### Task 6: D-007D3 — Router/runtime de alertas e checkpoint

**Files:**
- Create: `server/workShiftAlertsRouter.ts`
- Test: `server/workShiftAlertsRouter.test.ts`
- Create: `server/workShiftAlertsRuntime.ts`
- Modify: `server/rootRouter.ts`

**Interfaces:**
- Produces tRPC: `workShiftAlerts.list`, `.evaluate`, `.acknowledge`, `.resolve`.
- RBAC: `work_shift_alerts.view`; `work_shift_alerts.manage` para evaluate/acknowledge/resolve. Catálogo apenas, sem grants.

- [ ] **Step 1: RED** para autorização, escopo, evaluate restrito, acknowledge/resolve idempotentes e resolução que não altera jornada.
- [ ] **Step 2: GREEN** com runtime server-side carregando planejamento/sessão/status/equipes; cliente nunca envia `userId` arbitrário como prova de escopo.
- [ ] **Step 3: Root-router test** para quatro contracts.
- [ ] **Step 4: Full gates and checkpoint** `checkpoint/d007d3-work-shift-alerts-20260904` somente após quatro workflows verdes.

### Task 7: D-007D4 — Painel administrativo responsivo

**Files:**
- Create: `client/src/pages/WorkShiftAdminPage.tsx`
- Test: `client/src/pages/WorkShiftAdminPage.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/DashboardLayout.tsx`

**Interfaces:**
- Consumes somente `workShiftReports.*`, `workShiftAdjustments.*`, `workShiftAlerts.*`.
- O cliente não replica cálculos de jornada nem lógica de elegibilidade.

- [ ] **Step 1: Write rendered RED** exigindo cards/filas para ativos, pausados, previstos sem início, extrapolados, sem encerramento, ajustes pendentes, alertas por severidade e cobertura planejado x realizado; loading/vazio/erro explícitos.
- [ ] **Step 2: RED de RBAC/navegação**: item Jornada aparece somente a perfis com permissão adequada; ações approve/export/resolve respeitam permissões específicas.
- [ ] **Step 3: Implement minimal page** com composição responsiva desktop/mobile, filtros server-side e mutations invalidando apenas queries afetadas.
- [ ] **Step 4: Run GREEN** `corepack pnpm vitest run client/src/pages/WorkShiftAdminPage.test.tsx client/src/components/DashboardLayout.rendered.test.tsx`.
- [ ] **Step 5: Run visual evidence** nos workflows GIS/NEO existentes; não introduzir dependência visual do iframe NEO para o painel de Jornada.

### Task 8: D-007D4 — Inventário, evidência e homologação final

**Files:**
- Modify: `scripts/generate-trpc-coverage.mjs`
- Modify: `server/trpcCoverageGenerator.test.ts`
- Modify: `docs/TRPC_CONTRACT_COVERAGE.md`
- Create: `docs/D-007D-WORK-SHIFT-ADMIN-EVIDENCE.md`
- Modify: `todo.md`

**Interfaces:**
- Inventário deve descobrir explicitamente routers D1/D2/D3 compostos no `rootRouter` e classificar todos os novos procedures com evidência.

- [ ] **Step 1: Write RED do inventário** elevando o total real de procedures para o valor calculado pelo gerador e exigindo os 12 novos contratos D1/D2/D3 (`4 + 4 + 4`). Não hardcode o total antes de executar o gerador; o teste deve comparar a saída materializada ao conjunto esperado e falhar se houver procedure sem classificação.
- [ ] **Step 2: GREEN do gerador** adicionando fontes `workShiftAdjustmentsRouter.ts`, `workShiftReportsRouter.ts`, `workShiftAlertsRouter.ts` com os prefixos correspondentes e evidência direta das suítes D1/D2/D3.
- [ ] **Step 3: Materialize docs** executando o gerador do projeto; atualizar `todo.md` marcando D-007D concluída somente após gates finais.
- [ ] **Step 4: Fresh final verification**:

```bash
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

Expected: todos exit 0; registrar contagens reais de arquivos/testes na evidência.

- [ ] **Step 5: Four remote gates on exact same SHA**: Qualidade, GIS visual, NEO external, NEO workspace. Qualquer cancelamento por supersessão não vale como gate e deve ser repetido de forma limpa.
- [ ] **Step 6: Final checkpoint** criar `checkpoint/d007d-work-shift-admin-reports-alerts-20260904`; atualizar Draft PR funcional; fechar PR técnico de CI sem merge.
- [ ] **Step 7: Release 1.0 continuation**: somente depois desse checkpoint iniciar a próxima sequência já aprovada: E2E operacional → carga/estabilidade → segurança final → implantação/rollback/smoke → candidato Release 1.0.
