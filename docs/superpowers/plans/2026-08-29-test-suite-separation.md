# Test Suite Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar testes locais determinísticos dos testes que exigem banco e credenciais externas.

**Architecture:** O Vitest manterá uma configuração padrão para testes locais, com variáveis fictícias em setup dedicado e exclusão explícita de arquivos de integração. Uma segunda configuração selecionará somente arquivos `.integration.test.ts` e executará uma validação prévia do ambiente.

**Tech Stack:** Node.js 24, pnpm 10.4.1, Vitest 2.1.9 e TypeScript.

**Spec:** `docs/decisions/D002-test-suite-separation.md`

## Global Constraints

- Não alterar regras de negócio, banco, APIs, eventos ou conectores.
- Não armazenar credenciais reais no repositório.
- Não ocultar testes com `skip` condicionado ao ambiente.
- Preservar os 189 testes locais já aprovados e recuperar os 4 afetados por configuração.
- Manter o D-002 em branch separada e PR empilhado sobre o D-001.

---

### Task 1: Proteger a classificação das suítes

**Files:**
- Create: `server/testSuiteConfig.test.ts`
- Modify: `package.json`
- Rename: `server/localAuth.bootstrap.test.ts` para `server/localAuth.bootstrap.integration.test.ts`

**Interfaces:**
- Consumes: scripts do `package.json` e convenção `.integration.test.ts`.
- Produces: comandos `test`, `test:unit`, `test:integration` e `test:all` protegidos por regressão.

- [x] **Step 1:** criar teste que exige os quatro scripts e a nova classificação do bootstrap.
- [x] **Step 2:** executar `corepack pnpm vitest run server/testSuiteConfig.test.ts` e confirmar falha pelos scripts e nome ainda inexistentes.
- [x] **Step 3:** aplicar os scripts mínimos e renomear o teste de bootstrap.
- [x] **Step 4:** repetir o teste e confirmar aprovação.
- [x] **Step 5:** registrar o primeiro commit lógico.

### Task 2: Tornar a suíte local determinística

**Files:**
- Create: `vitest.unit.setup.ts`
- Modify: `vitest.config.ts`
- Rename: `server/storage.external.test.ts` para `server/storage.test.ts`

**Interfaces:**
- Consumes: `process.env` antes dos imports da aplicação.
- Produces: ambiente local fictício e exclusão de `**/*.integration.test.ts`.

- [x] **Step 1:** executar os testes locais afetados sem variáveis e registrar as falhas de título, JWT e armazenamento.
- [x] **Step 2:** adicionar ao setup valores fictícios para `NODE_ENV`, `VITE_APP_TITLE`, `JWT_SECRET`, `BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY`.
- [x] **Step 3:** configurar `setupFiles` e exclusão explícita dos arquivos de integração.
- [x] **Step 4:** renomear o teste de armazenamento para refletir que toda chamada externa é simulada.
- [x] **Step 5:** executar `pnpm test:unit` e confirmar zero falhas e zero testes ignorados.
- [x] **Step 6:** registrar o segundo commit lógico.

### Task 3: Validar o ambiente de integração sem ocultar testes

**Files:**
- Create: `server/test/integrationEnvironment.ts`
- Create: `server/test/integrationEnvironment.test.ts`
- Create: `vitest.integration.setup.ts`
- Create: `vitest.integration.config.ts`

**Interfaces:**
- Consumes: `NodeJS.ProcessEnv`.
- Produces: `validateIntegrationEnvironment(env): void`, com lista explícita de variáveis ausentes.

- [x] **Step 1:** escrever testes para ambiente completo e ambiente com variáveis ausentes.
- [x] **Step 2:** executar os testes e confirmar falha porque o validador ainda não existe.
- [x] **Step 3:** implementar o validador mínimo e o setup de integração.
- [x] **Step 4:** criar configuração que inclui somente `server/**/*.integration.test.ts`.
- [x] **Step 5:** repetir os testes do validador e confirmar aprovação.
- [x] **Step 6:** executar `pnpm test:integration` sem ambiente e confirmar mensagem explícita.
- [x] **Step 7:** registrar o terceiro commit lógico.

### Task 4: Verificação e documentação

**Files:**
- Modify: `docs/source-package/CHANGELOG.md`
- Modify: `docs/decisions/D002-test-suite-separation.md`

**Interfaces:**
- Consumes: comandos finalizados das Tasks 1 a 3.
- Produces: evidência reexecutável e histórico didático do D-002.

- [x] **Step 1:** executar instalação congelada.
- [x] **Step 2:** executar segurança, TypeScript e suíte local completa.
- [x] **Step 3:** executar build de produção.
- [x] **Step 4:** confirmar que a suíte de integração sem ambiente falha antes da coleta e não ignora testes.
- [x] **Step 5:** atualizar changelog e decisão com resultados reais.
- [x] **Step 6:** revisar o diff e criar o checkpoint Git local.
- [ ] **Step 7:** publicar branch e abrir PR em rascunho sobre `fix/reproducible-install`, sem merge automático.
