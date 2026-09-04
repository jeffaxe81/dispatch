# Jornada em Tempo Real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a tela autenticada e responsiva de Jornada em Tempo Real para o próprio usuário operar início, intervalo, retomada e encerramento da jornada.

**Architecture:** A nova `WorkShiftPage` consome exclusivamente o router tRPC `workShift`, deriva a interface do estado retornado e invalida `workShift.current` após cada mutação. A rota `/jornada` e o item lateral são integrados aos pontos de navegação existentes, sem criar permissões administrativas ou transportar `userId`/timestamp pelo cliente.

**Tech Stack:** React 19, TypeScript, tRPC, TanStack Query, Wouter, Testing Library, Vitest, Tailwind, componentes UI existentes do AXE Dispatch.

**Spec:** `docs/superpowers/specs/2026-09-04-jornada-tempo-real-design.md`

## Global Constraints

- O cliente não envia `userId` para nenhuma mutação de Jornada.
- O cliente não envia timestamp para nenhuma mutação de Jornada.
- Usuário e horário continuam resolvidos no servidor.
- Reutilizar `DashboardLayout`, `Card`, `Button`, `Badge` e padrões existentes.
- Não integrar ainda com o motor de despacho.
- Não fazer merge, deploy ou alteração de produção nesta etapa.

---

### Task 1: Contrato visual da WorkShiftPage

**Files:**
- Create: `client/src/pages/WorkShiftPage.test.tsx`
- Create: `client/src/pages/WorkShiftPage.tsx`

**Interfaces:**
- Consumes: `trpc.workShift.current.useQuery`, `trpc.workShift.start.useMutation`, `break.useMutation`, `resume.useMutation`, `end.useMutation`.
- Produces: componente React default `WorkShiftPage`.

- [ ] **Step 1: Write the failing test**

Criar mocks tRPC no mesmo padrão de `AgentPage.test.tsx` e cobrir quatro estados. O primeiro RED deve exigir que `fora_jornada` mostre `Iniciar jornada` e que `em_jornada` mostre `Iniciar intervalo` e `Encerrar jornada`.

```tsx
render(<WorkShiftPage />);
expect(screen.getByRole("button", { name: /iniciar jornada/i })).toBeTruthy();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run client/src/pages/WorkShiftPage.test.tsx`
Expected: FAIL porque `WorkShiftPage.tsx` ainda não existe.

- [ ] **Step 3: Write minimal implementation**

Criar página com `DashboardLayout`, `workShift.current`, rótulo de estado e ações condicionais. Manter a lógica de apresentação em funções pequenas como `stateLabel` e `formatDateTime`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run client/src/pages/WorkShiftPage.test.tsx`
Expected: PASS para estados e ações básicas.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/WorkShiftPage.test.tsx client/src/pages/WorkShiftPage.tsx
git commit -m "feat(jornada): criar tela de jornada em tempo real"
```

### Task 2: Mutations, invalidation and feedback

**Files:**
- Modify: `client/src/pages/WorkShiftPage.test.tsx`
- Modify: `client/src/pages/WorkShiftPage.tsx`

**Interfaces:**
- Consumes: mutações sem input e `trpc.useUtils().workShift.current.invalidate()`.
- Produces: ações seguras com feedback de sucesso/erro.

- [ ] **Step 1: Write the failing tests**

Adicionar testes para:

```tsx
await user.click(screen.getByRole("button", { name: /iniciar jornada/i }));
expect(mocks.start).toHaveBeenCalledWith();
await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled());
```

Adicionar cenário de erro e cenário `isPending=true` com botão `disabled`.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm exec vitest run client/src/pages/WorkShiftPage.test.tsx`
Expected: FAIL até as mutações e feedback serem ligados.

- [ ] **Step 3: Implement minimal action handling**

Usar `mutate(undefined, { onSuccess, onError })` ou callbacks equivalentes do hook existente. Em sucesso, invalidar `workShift.current` e mostrar `toast.success`. Em erro, renderizar mensagem controlada em `role="alert"`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm exec vitest run client/src/pages/WorkShiftPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/WorkShiftPage.test.tsx client/src/pages/WorkShiftPage.tsx
git commit -m "feat(jornada): ligar ações e feedback da jornada"
```

### Task 3: Navegação

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/DashboardLayout.tsx`
- Create or modify test: `client/src/components/DashboardLayout.test.tsx` quando existir; caso contrário validar `getMenuItems` no arquivo de teste apropriado existente.

**Interfaces:**
- Consumes: `WorkShiftPage`.
- Produces: rota `/jornada` e menu `Jornada`.

- [ ] **Step 1: Write the failing test**

Garantir que `getMenuItems(...)` contenha `{ label: "Jornada", path: "/jornada" }` para usuário operacional autenticado.

- [ ] **Step 2: Run RED**

Run: teste de `DashboardLayout` correspondente.
Expected: FAIL porque o item ainda não existe.

- [ ] **Step 3: Implement minimal navigation**

Importar ícone de relógio apropriado, adicionar o item `Jornada` sem exigir permissão administrativa e registrar `<Route path={"/jornada"} component={WorkShiftPage} />`.

- [ ] **Step 4: Run targeted tests**

Run: testes da página + layout.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/components/DashboardLayout.tsx client/src/components/*test* client/src/pages/WorkShiftPage*
git commit -m "feat(jornada): integrar rota e menu"
```

### Task 4: CI da UI de Jornada

**Files:**
- Modify: `.github/workflows/jornada-mvp-quality.yml`

**Interfaces:**
- Consumes: testes da UI e `pnpm check`.
- Produces: gate CI repetível para backend + frontend do MVP.

- [ ] **Step 1: Extend workflow paths**

Adicionar:

```yaml
- "client/src/pages/WorkShiftPage*.tsx"
- "client/src/App.tsx"
- "client/src/components/DashboardLayout*.tsx"
```

- [ ] **Step 2: Add UI test step**

```yaml
- name: Executar testes da tela de Jornada
  run: pnpm exec vitest run client/src/pages/WorkShiftPage.test.tsx
```

- [ ] **Step 3: Run via PR**

Expected: testes de domínio/persistência, router, UI, tipos e verificação da migração passam.

- [ ] **Step 4: Check migration idempotence**

Como `0003` já está versionada, `drizzle-kit generate` não deve criar uma nova migração sem mudança de schema. O workflow deve aceitar ausência de novo patch quando o schema estiver sincronizado, em vez de exigir `test -s jornada-migration.patch`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/jornada-mvp-quality.yml
git commit -m "ci(jornada): validar tela e migração sincronizada"
```

### Task 5: Checkpoint e homologação pré-visual

**Files:**
- Update: PR #24 body/status only; no production files.

**Interfaces:**
- Produces: checkpoint estável antes da homologação visual desktop/mobile.

- [ ] **Step 1: Confirm latest workflow success**

Expected: todos os passos do workflow `Jornada MVP quality` em `success`.

- [ ] **Step 2: Create checkpoint branch**

Nome: `checkpoint/jornada-mvp-realtime-ui-20260904`.

- [ ] **Step 3: Update PR #24**

Registrar UI concluída, CI verde e próximo gate: homologação visual desktop/mobile.

- [ ] **Step 4: Do not merge or deploy**

Manter PR Draft até homologação visual e integração posterior com despacho.
