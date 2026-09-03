# Reproducible Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer uma instalação congelada produzir sempre a árvore de dependências registrada, sem ajustes manuais.

**Architecture:** `packageManager` será a única fonte da versão do pnpm. O workspace conterá apenas configurações aplicáveis à árvore atual, e o lockfile continuará sendo a fonte das versões instaladas. Um teste automatizado impedirá que essas fontes voltem a divergir.

**Tech Stack:** Node.js 24, pnpm 10.4.1, YAML e Vitest.

**Spec:** `docs/decisions/D001-reproducible-install.md`

## Global Constraints

- Não atualizar bibliotecas funcionais da aplicação.
- Preservar o pnpm 10.4.1 fixado com hash em `packageManager`.
- Preservar as versões efetivamente registradas no lockfile.
- Usar instalação congelada como critério final.

---

### Task 1: Proteger a coerência da configuração

**Files:**
- Create: `server/dependencyConfig.test.ts`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Delete: `patches/wouter@3.7.1.patch`

**Interfaces:**
- Consumes: `packageManager`, `devDependencies`, `overrides` e `patchedDependencies`.
- Produces: teste automatizado que valida uma única fonte do pnpm e igualdade entre workspace e lockfile.

- [x] **Step 1:** criar o teste de coerência.
- [x] **Step 2:** executar `corepack pnpm vitest run server/dependencyConfig.test.ts` e confirmar falha por duplicação do pnpm e divergência do lockfile.
- [x] **Step 3:** remover o pnpm redundante, o patch e os overrides obsoletos e atualizar apenas o importador do lockfile.
- [x] **Step 4:** repetir o teste e confirmar aprovação.

### Task 2: Verificar a instalação e a aplicação

**Files:**
- Modify: `docs/source-package/CHANGELOG.md`

**Interfaces:**
- Consumes: configuração corrigida da Task 1.
- Produces: evidência de instalação, compilação, segurança, testes e build.

- [x] **Step 1:** remover `node_modules` do worktree descartável e executar `corepack pnpm install --frozen-lockfile`.
- [x] **Step 2:** executar `corepack pnpm security:check` e `corepack pnpm check`.
- [x] **Step 3:** executar `corepack pnpm test` com o ambiente de teste documentado e registrar dependências externas ainda ausentes.
- [x] **Step 4:** executar `corepack pnpm build`.
- [x] **Step 5:** registrar a alteração e os resultados no changelog.
