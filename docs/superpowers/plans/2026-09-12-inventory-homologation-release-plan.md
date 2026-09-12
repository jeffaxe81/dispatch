# Inventory Homologation and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** homologar a integração Motor de Ativos / Inventário com o Sistema de Despacho e preparar um pacote Go/No-Go auditável, sem executar deploy produtivo.

**Architecture:** o Motor de Ativos continua produto separado, dono de seu banco, e o Despacho consome REST/eventos versionados. A homologação valida contratos, isolamento, degradação controlada, observabilidade e rollback sem criar escrita cruzada ou dependência rígida de disponibilidade.

**Tech Stack:** TypeScript, Node.js 24, pnpm 10.4.1, Vitest, Vite, esbuild, Docker, GitHub Actions.

**Spec:** `docs/superpowers/plans/2026-09-10-inventory-assets-engine-microdeliveries.md`

## Global Constraints

- Baseline de release: `c59b11084e6451ba13ccc49bb0fa8c078691ae36`.
- Não executar `db:migrate` ou `db:push` em produção.
- Não aplicar grants produtivos.
- Não realizar deploy produtivo neste ciclo.
- Motor e Despacho permanecem separados; sem acesso cruzado a banco.
- Tenant, usuário, correlação, autorização e idempotência continuam obrigatórios.
- Nova funcionalidade não faz parte deste ciclo; qualquer demanda nova retorna ao backlog.
- Decisão final deve ser `GO`, `GO COM RESSALVAS` ou `NO-GO`, com evidências.

---

### Task 1: Congelar baseline e evidências de origem

**Files:**
- Create: `docs/releases/inventory-r1-baseline.md`
- Read: `package.json`
- Read: `server/inventoryReleaseReadiness.ts`

**Interfaces:**
- Consumes: merge M16 `c59b11084e6451ba13ccc49bb0fa8c078691ae36`.
- Produces: registro auditável da baseline, versão e gates de origem.

- [ ] **Step 1:** confirmar que `main` aponta para `c59b11084e6451ba13ccc49bb0fa8c078691ae36`.
- [ ] **Step 2:** registrar versão do `package.json` e os contratos REST/eventos vigentes.
- [ ] **Step 3:** registrar os workflows GREEN da M16 como evidência de entrada, sem reutilizá-los como evidência final de homologação.
- [ ] **Step 4:** criar `docs/releases/inventory-r1-baseline.md` com SHA, versão, data e escopo.
- [ ] **Step 5:** commit `docs: registrar baseline R1 do inventário`.

### Task 2: Homologação funcional controlada

**Files:**
- Test: `server/assetInventoryClient.test.ts`
- Test: `server/assetInventoryEventConsumer.test.ts`
- Test: `client/src/components/AssetContextPanel.test.tsx`
- Create: `docs/releases/inventory-r1-functional-evidence.md`

**Interfaces:**
- Consumes: `AssetInventoryClient`, consumidor de eventos M15 e painel M14.
- Produces: evidência funcional do fluxo Inventário dentro do Despacho.

- [ ] **Step 1:** executar `corepack pnpm test -- server/assetInventoryClient.test.ts server/assetInventoryEventConsumer.test.ts client/src/components/AssetContextPanel.test.tsx`.
- [ ] **Step 2:** validar pesquisa, detalhe, localização e vínculo de ocorrência/ordem/atividade.
- [ ] **Step 3:** validar indisponibilidade do Motor com falha confinada ao contexto de inventário.
- [ ] **Step 4:** validar evento conhecido, replay, duplicidade, versão incompatível e tipo desconhecido.
- [ ] **Step 5:** registrar resultados e qualquer ressalva em `docs/releases/inventory-r1-functional-evidence.md`.
- [ ] **Step 6:** commit `test: registrar homologação funcional R1 do inventário`.

### Task 3: Segurança, autorização e multi-tenant

**Files:**
- Test: `server/multiTenantBoundary.test.ts`
- Test: `server/authorization.test.ts`
- Test: `server/inventoryArchitectureBoundary.test.ts`
- Test: `server/inventoryIntegrationContract.test.ts`
- Create: `docs/releases/inventory-r1-security-evidence.md`

**Interfaces:**
- Consumes: identidade `tenantId/userId/correlationId` e contratos M0/M13/M15.
- Produces: evidência de isolamento e autorização negativa.

- [ ] **Step 1:** executar `corepack pnpm security:check`.
- [ ] **Step 2:** executar `corepack pnpm test -- server/multiTenantBoundary.test.ts server/authorization.test.ts server/inventoryArchitectureBoundary.test.ts server/inventoryIntegrationContract.test.ts`.
- [ ] **Step 3:** confirmar que tenant cruzado não lê nem altera contexto de outro tenant.
- [ ] **Step 4:** confirmar autorização negativa para operações protegidas.
- [ ] **Step 5:** confirmar correlação por `tenantId/userId/correlationId` nos contratos aplicáveis.
- [ ] **Step 6:** registrar a matriz de permissões como proposta; nenhum grant é aplicado.
- [ ] **Step 7:** commit `test: registrar segurança e tenant R1 do inventário`.

### Task 4: Regressão completa, build e carga mínima

**Files:**
- Read: `package.json`
- Test: `server/inventoryReleaseReadiness.test.ts`
- Create: `docs/releases/inventory-r1-regression-evidence.md`

**Interfaces:**
- Consumes: gate M16 e suíte atual do Dispatch.
- Produces: evidência fresca de readiness para Go/No-Go.

- [ ] **Step 1:** executar `corepack pnpm check`.
- [ ] **Step 2:** executar `corepack pnpm test:all`.
- [ ] **Step 3:** executar `corepack pnpm build`.
- [ ] **Step 4:** executar `corepack pnpm test:gis-visual`.
- [ ] **Step 5:** executar `corepack pnpm test:neo-visual`.
- [ ] **Step 6:** validar empacotamento Docker pelo workflow de Qualidade.
- [ ] **Step 7:** confirmar no teste M16 a carga mínima de 250 eventos distintos e fail-closed.
- [ ] **Step 8:** registrar duração, falhas, retries e resultado final em `docs/releases/inventory-r1-regression-evidence.md`.
- [ ] **Step 9:** commit `test: consolidar regressão R1 do inventário`.

### Task 5: Ensaio documental de rollback

**Files:**
- Read: `docs/operations/m16-inventory-hardening.md`
- Create: `docs/releases/inventory-r1-rollback.md`

**Interfaces:**
- Consumes: baseline `c59b11084e6451ba13ccc49bb0fa8c078691ae36` e separação Motor/Despacho.
- Produces: procedimento reversível sem executar rollback real.

- [ ] **Step 1:** definir gatilhos de rollback: erro de contrato, regressão crítica, falha de tenant, falha de autorização ou indisponibilidade não confinada.
- [ ] **Step 2:** documentar reversão da aplicação para o último artefato homologado.
- [ ] **Step 3:** documentar que alterações reais de banco, se existirem em release posterior, exigem plano específico e backup/verificação prévios.
- [ ] **Step 4:** documentar validações pós-rollback: autenticação, ocorrência, mapa, inventário degradado e consumidor de eventos.
- [ ] **Step 5:** registrar responsáveis e evidências necessárias, sem executar ação produtiva.
- [ ] **Step 6:** commit `docs: definir rollback R1 do inventário`.

### Task 6: Pacote Go/No-Go

**Files:**
- Create: `docs/releases/inventory-r1-go-no-go.md`
- Read: `docs/releases/inventory-r1-baseline.md`
- Read: `docs/releases/inventory-r1-functional-evidence.md`
- Read: `docs/releases/inventory-r1-security-evidence.md`
- Read: `docs/releases/inventory-r1-regression-evidence.md`
- Read: `docs/releases/inventory-r1-rollback.md`

**Interfaces:**
- Consumes: todas as evidências R1.
- Produces: recomendação formal de release, sem executar produção.

- [ ] **Step 1:** consolidar evidências por requisito e linkar SHA/workflow correspondente.
- [ ] **Step 2:** listar riscos residuais e classificar impacto/probabilidade.
- [ ] **Step 3:** marcar como bloqueador qualquer falha de tenant, autorização, contrato, build, teste ou rollback.
- [ ] **Step 4:** emitir somente uma decisão: `GO`, `GO COM RESSALVAS` ou `NO-GO`.
- [ ] **Step 5:** incluir explicitamente: `Deploy produtivo não autorizado por este documento`.
- [ ] **Step 6:** commit `docs: consolidar pacote go-no-go R1 do inventário`.

## Gate de encerramento

O ciclo R1 é considerado homologado apenas quando todas as evidências deste plano estiverem versionadas, os checks aplicáveis estiverem GREEN e o pacote Go/No-Go estiver emitido. Mesmo em caso de `GO`, produção permanece bloqueada até autorização explícita para o release produtivo.