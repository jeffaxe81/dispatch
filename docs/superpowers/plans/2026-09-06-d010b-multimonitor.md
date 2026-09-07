# D-010B Multi-Monitor N Telas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estender o Workspace do AXE Dispatch para múltiplas superfícies simultâneas sem limite lógico fixo, preservando o catálogo seguro, RBAC, tenant e persistência do D-010A.

**Architecture:** Evoluir `WorkspaceLayout` para `version: 2` com `screens[]`, migrando layouts v1 de forma determinística. Cada superfície externa é uma rota autenticada que renderiza apenas widgets registrados; a coordenação local usa `BroadcastChannel` e um `MultiMonitorManager`, enquanto o backend continua autoritativo para persistência.

**Tech Stack:** React 19, TypeScript 5.9, Wouter 3, tRPC 11, Zod 4, Vitest, Testing Library, Drizzle/MySQL existente, Web APIs `window.open` e `BroadcastChannel` com fallback seguro.

**Spec:** `docs/superpowers/specs/2026-09-06-d010b-multimonitor-design.md`

## Global Constraints

- Não criar mecanismo paralelo de layout: D-010B evolui o Workspace D-010A.
- Não impor limite lógico fixo de telas; limites defensivos de payload podem existir para proteção operacional.
- `tenantId` e `userId` permanecem exclusivamente server-side.
- `screenId` é apenas seletor de superfície dentro do layout autorizado.
- Nenhuma URL, script, componente ou widget arbitrário pode ser persistido/renderizado.
- `BroadcastChannel` coordena janelas, mas nunca substitui tRPC/backend como autoridade.
- Fechamento/falha de janela externa não pode derrubar a tela principal.
- D-010B não altera regras de negócio de despacho, GIS, jornada, telecom, ocorrências ou equipes.
- Nenhuma migration produtiva, deploy, grant automático ou remoção de checkpoint faz parte do plano.
- TDD obrigatório: RED → GREEN → regressão por tarefa; suíte completa apenas nos gates de fechamento.

---

### Task 1: WorkspaceLayout v2 e migração v1 → v2

**Files:**
- Modify: `shared/workspaceLayout.ts`
- Modify: `server/workspace/workspaceLayoutDomain.test.ts`

**Interfaces:**
- Produces: `WorkspaceScreen`, `PreferredDisplayHint`, `workspaceScreenSchema`, `workspaceLayoutV2Schema`, `migrateWorkspaceV1ToV2(input)`, `normalizeWorkspaceLayoutV2(input, allowedTypes)`.

- [ ] **Step 1: Escrever testes RED** para: v1 migra sem perda; exatamente uma tela `primary`; `screenId` duplicado falha; `screenId` vazio falha; widgets desconhecidos continuam removidos; N telas válidas são aceitas.
- [ ] **Step 2: Executar** `pnpm vitest run server/workspace/workspaceLayoutDomain.test.ts` e confirmar RED causado pela ausência do modelo v2.
- [ ] **Step 3: Implementar tipos e schemas** com `version: 2`, `screens[]`, `mode: "primary" | "external"`, `order`, `preferredDisplay` opcional e validação de exatamente uma tela primária.
- [ ] **Step 4: Implementar `migrateWorkspaceV1ToV2`** criando `screenId: "primary"`, `name: "Principal"`, `order: 0`, `mode: "primary"` e reutilizando todos os widgets v1.
- [ ] **Step 5: Implementar `normalizeWorkspaceLayoutV2`** aceitando v1 ou v2, migrando quando necessário e filtrando widgets fora de `allowedTypes`.
- [ ] **Step 6: Rodar o teste isolado** e confirmar GREEN.
- [ ] **Step 7: Commit** `feat(d010b): add multiscreen workspace domain`.

### Task 2: Evoluir serviço e persistência sem nova tabela

**Files:**
- Modify: `server/workspace/workspaceLayoutService.ts`
- Modify: `server/workspace/workspaceLayoutService.test.ts`
- Modify: `server/workspace/workspaceLayoutRepository.ts`
- Modify: `server/workspace/workspaceLayoutRepository.test.ts`
- Modify: `drizzle/workspaceLayoutSchema.ts` only if type annotation requires it

**Interfaces:**
- Consumes: `normalizeWorkspaceLayoutV2`.
- Produces: serviço D-010A compatível com v1/v2 e persistência de payload v2 no mesmo `layout_json`.

- [ ] **Step 1: Escrever testes RED** comprovando que leitura de v1 retorna v2 migrado, save persiste v2 normalizado, reset retorna default v2 e nenhuma nova chave de tenant/user é aceita.
- [ ] **Step 2: Rodar** `pnpm vitest run server/workspace/workspaceLayoutService.test.ts server/workspace/workspaceLayoutRepository.test.ts`.
- [ ] **Step 3: Ajustar serviço** para usar normalização/migração v2 e converter `DEFAULT_OPERATIONAL_WORKSPACE` em uma única superfície primária equivalente à Home atual.
- [ ] **Step 4: Preservar mesma tabela** `workspace_layouts`; atualizar somente tipos TypeScript se necessário, sem criar migration se `layout_json` continuar genérico.
- [ ] **Step 5: Rodar testes isolados** e confirmar GREEN.
- [ ] **Step 6: Commit** `feat(d010b): persist multiscreen workspace layouts`.

### Task 3: API tRPC para seleção segura de superfície

**Files:**
- Modify: `server/routers/workspace.ts`
- Modify: `server/routers/workspace.test.ts`

**Interfaces:**
- Produces: `workspace.getOwn`, `workspace.saveOwn`, `workspace.resetOwn` compatíveis com v2 e novo `workspace.getOwnScreen({ name, screenId })`.

- [ ] **Step 1: Escrever testes RED** para `getOwnScreen`: retorna somente superfície autorizada existente; `screenId` inexistente resulta `NOT_FOUND`; body não aceita tenant/user; layout sem permissão remove widget também na tela externa.
- [ ] **Step 2: Rodar** `pnpm vitest run server/routers/workspace.test.ts`.
- [ ] **Step 3: Implementar input estrito** `z.object({ name, screenId }).strict()` e resolver layout pelo serviço antes de selecionar a superfície.
- [ ] **Step 4: Não aceitar URL nem metadado executável** no contrato de superfície.
- [ ] **Step 5: Rodar o teste isolado** e confirmar GREEN.
- [ ] **Step 6: Atualizar inventário de contrato tRPC** pelo script já usado no projeto e revisar somente o diff correspondente.
- [ ] **Step 7: Commit** `feat(d010b): expose secure workspace screen api`.

### Task 4: Canal de sincronização local entre janelas

**Files:**
- Create: `client/src/workspace/multimonitor/workspaceChannel.ts`
- Create: `client/src/workspace/multimonitor/workspaceChannel.test.ts`

**Interfaces:**
- Produces: `WorkspaceChannelEvent`, `createWorkspaceChannel(name)`, `publish(event)`, `subscribe(listener)`, `close()`.

- [ ] **Step 1: Escrever testes RED** para publicação/assinatura, fechamento, serialização somente de eventos permitidos e fallback quando `BroadcastChannel` não existe.
- [ ] **Step 2: Rodar** `pnpm vitest run client/src/workspace/multimonitor/workspaceChannel.test.ts`.
- [ ] **Step 3: Implementar allowlist de eventos**: `workspace-screen-opened`, `workspace-screen-closed`, `workspace-layout-updated`, `workspace-refresh-requested`, `workspace-focus-screen`.
- [ ] **Step 4: Implementar adapter nulo seguro** quando `globalThis.BroadcastChannel` não existir.
- [ ] **Step 5: Rodar teste isolado** e confirmar GREEN.
- [ ] **Step 6: Commit** `feat(d010b): add workspace cross-window channel`.

### Task 5: MultiMonitorManager

**Files:**
- Create: `client/src/workspace/multimonitor/MultiMonitorManager.ts`
- Create: `client/src/workspace/multimonitor/MultiMonitorManager.test.ts`

**Interfaces:**
- Consumes: `WorkspaceScreen[]`, `workspaceChannel`.
- Produces: `openScreen(screen)`, `openAllExternal(screens)`, `focusScreen(screenId)`, `closeScreen(screenId)`, `isOpen(screenId)`, `syncClosedWindows()`.

- [ ] **Step 1: Escrever testes RED** usando fake `window.open` para: abrir externas; não duplicar janela; focar existente; detectar `closed`; reabrir fechada; registrar pop-up bloqueado (`window.open` retorna `null`); rejeitar `primary` em `openScreen`.
- [ ] **Step 2: Rodar** `pnpm vitest run client/src/workspace/multimonitor/MultiMonitorManager.test.ts`.
- [ ] **Step 3: Implementar mapa local** `Map<screenId, Window>` sem armazenar dados de negócio.
- [ ] **Step 4: Construir rota externa somente com `workspace` e `screen` codificados** e mesma origem.
- [ ] **Step 5: `openAllExternal` deve retornar resultado por superfície** (`opened`, `focused`, `blocked`) para feedback da UI.
- [ ] **Step 6: Rodar teste isolado** e confirmar GREEN.
- [ ] **Step 7: Commit** `feat(d010b): add multi monitor window manager`.

### Task 6: Rota e página de superfície externa

**Files:**
- Create: `client/src/pages/WorkspaceExternalScreenPage.tsx`
- Create: `client/src/pages/WorkspaceExternalScreenPage.test.tsx`
- Modify: route registration file currently used by Wouter in the project
- Create or reuse: `client/src/workspace/WorkspaceScreenCanvas.tsx`

**Interfaces:**
- Consumes: `workspace.getOwnScreen`, registry D-010A.
- Produces: rota `/workspace/external?workspace=<name>&screen=<screenId>`.

- [ ] **Step 1: Localizar o arquivo real de registro de rotas Wouter** antes da edição e registrar o caminho no commit/diff; não criar roteador paralelo.
- [ ] **Step 2: Escrever testes RED** para query válida, parâmetros ausentes, superfície inexistente, sessão inválida e widget sem capability.
- [ ] **Step 3: Implementar a página** fazendo query por `name/screenId`, renderizando somente aquela superfície pelo catálogo seguro.
- [ ] **Step 4: Implementar fallback visual** “Superfície indisponível” com ação para retornar à principal, sem stack trace ou tela quebrada.
- [ ] **Step 5: Garantir que a URL não carregue tenant/user** e que parâmetros extras sejam ignorados/rejeitados conforme parser estrito.
- [ ] **Step 6: Rodar teste isolado** e confirmar GREEN.
- [ ] **Step 7: Commit** `feat(d010b): add external workspace screen route`.

### Task 7: Editor de superfícies no modo Personalizar

**Files:**
- Create: `client/src/workspace/multimonitor/WorkspaceScreensEditor.tsx`
- Create: `client/src/workspace/multimonitor/WorkspaceScreenTabs.tsx`
- Create: `client/src/workspace/multimonitor/WorkspaceScreensEditor.test.tsx`
- Modify: `client/src/workspace/WorkspaceCanvas.tsx`

**Interfaces:**
- Produces operações locais de rascunho: `addScreen`, `renameScreen`, `reorderScreen`, `setPrimaryScreen`, `setExternalScreen`, `moveWidgetToScreen`, `removeScreen`.

- [ ] **Step 1: Escrever testes RED** para criar, renomear, reordenar, trocar primária, mover widget entre telas, impedir zero/múltiplas primárias e exigir confirmação/realocação ao remover tela com widgets.
- [ ] **Step 2: Rodar** `pnpm vitest run client/src/workspace/multimonitor/WorkspaceScreensEditor.test.tsx`.
- [ ] **Step 3: Implementar edição somente em estado local**; nenhuma alteração persiste antes de `Salvar` do Workspace.
- [ ] **Step 4: Ao cancelar**, restaurar exatamente o layout carregado do backend.
- [ ] **Step 5: Ao salvar**, enviar layout v2 completo pela API existente.
- [ ] **Step 6: Rodar teste isolado** e confirmar GREEN.
- [ ] **Step 7: Commit** `feat(d010b): add multiscreen workspace editor`.

### Task 8: Abertura coordenada “Abrir configuração de operação”

**Files:**
- Create: `client/src/workspace/multimonitor/OpenOperationLayoutButton.tsx`
- Create: `client/src/workspace/multimonitor/OpenOperationLayoutButton.test.tsx`
- Modify: `client/src/workspace/WorkspaceToolbar.tsx`

**Interfaces:**
- Consumes: `MultiMonitorManager.openAllExternal`.
- Produces: ação única que abre/foca todas as telas externas configuradas e apresenta resultado.

- [ ] **Step 1: Escrever testes RED** para ação de usuário, contagem de abertas/focadas/bloqueadas e ausência de superfícies externas.
- [ ] **Step 2: Rodar** `pnpm vitest run client/src/workspace/multimonitor/OpenOperationLayoutButton.test.tsx`.
- [ ] **Step 3: Implementar botão** disparando todas as chamadas `window.open` dentro da mesma ação do usuário, minimizando bloqueio de pop-up.
- [ ] **Step 4: Exibir feedback não modal** listando superfícies bloqueadas e permitindo tentativa individual manual.
- [ ] **Step 5: Não prometer posicionamento físico garantido**; exibir apenas status de abertura.
- [ ] **Step 6: Rodar teste isolado** e confirmar GREEN.
- [ ] **Step 7: Commit** `feat(d010b): open saved operation screens`.

### Task 9: Hints de display e posicionamento progressivo

**Files:**
- Create: `client/src/workspace/multimonitor/displayPlacement.ts`
- Create: `client/src/workspace/multimonitor/displayPlacement.test.ts`
- Modify: `client/src/workspace/multimonitor/MultiMonitorManager.ts`

**Interfaces:**
- Produces: `resolveWindowFeatures(preferredDisplay, environment)` retornando string de features ou fallback vazio.

- [ ] **Step 1: Escrever testes RED** para hint com ordinal/label, API indisponível, permissão negada e coordenadas inválidas.
- [ ] **Step 2: Rodar** `pnpm vitest run client/src/workspace/multimonitor/displayPlacement.test.ts`.
- [ ] **Step 3: Implementar comportamento progressivo**: usar capacidade de posicionamento somente quando explicitamente disponível/autorizada; caso contrário, abrir janela normalmente.
- [ ] **Step 4: Nunca persistir identificador físico sensível/instável**; `preferredDisplay` continua somente hint.
- [ ] **Step 5: Rodar teste isolado** e confirmar GREEN.
- [ ] **Step 6: Commit** `feat(d010b): add progressive display placement hints`.

### Task 10: Segurança e regressão específica D-010B

**Files:**
- Modify: `scripts/security-regression-check.mjs`
- Create: `client/src/workspace/multimonitor/multimonitorSecurity.test.tsx`
- Modify: `docs/TRPC_CONTRACT_COVERAGE.md`
- Modify: `docs/UI_ROUTE_STATE_MATRIX.md`

**Interfaces:**
- Produces invariantes automatizadas para multi-monitor.

- [ ] **Step 1: Escrever testes RED** exigindo: nenhuma URL remota em screen; nenhuma autoridade tenant/user no cliente; `screenId` somente seletor; rota externa usa catálogo fechado; canal aceita apenas eventos da allowlist.
- [ ] **Step 2: Atualizar `security-regression-check.mjs`** para detectar regressão desses contratos.
- [ ] **Step 3: Atualizar matrizes de rota/contrato** com `/workspace/external` e `workspace.getOwnScreen`.
- [ ] **Step 4: Rodar** `pnpm security:check` e somente os testes D-010B afetados.
- [ ] **Step 5: Commit** `test(d010b): harden multiscreen security contracts`.

### Task 11: Integração, acessibilidade e regressão do D-010A

**Files:**
- Modify as needed: `client/src/workspace/WorkspaceCanvas.test.tsx`
- Create: `client/src/workspace/multimonitor/multimonitorIntegration.test.tsx`

**Interfaces:**
- Produces evidência de compatibilidade single-screen e fluxo N telas.

- [ ] **Step 1: Escrever/ajustar testes** garantindo que um layout v1 carregado continua visualmente equivalente após migração.
- [ ] **Step 2: Validar teclado/foco** em tabs de superfícies, ações Abrir/Focar/Reabrir, adicionar/remover/renomear e feedback de bloqueio.
- [ ] **Step 3: Testar cenário com pelo menos 12 superfícies sintéticas** para comprovar ausência de limite lógico pequeno no domínio/UI, sem abrir 12 janelas reais no teste.
- [ ] **Step 4: Rodar testes D-010A + D-010B relevantes** e confirmar GREEN.
- [ ] **Step 5: Commit** `test(d010b): verify multiscreen integration and accessibility`.

### Task 12: Gates finais, checkpoint e documentação

**Files:**
- Create: `docs/releases/d010b-verification.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces candidato GREEN auditável do D-010B.

- [ ] **Step 1: Executar instalação congelada** conforme workflow atual do projeto.
- [ ] **Step 2: Executar** `pnpm security:check`.
- [ ] **Step 3: Executar** `pnpm check`.
- [ ] **Step 4: Executar** `pnpm test` uma vez no gate final e registrar contagem real de arquivos/testes.
- [ ] **Step 5: Executar** `pnpm build`.
- [ ] **Step 6: Executar regressões visuais existentes** GIS, NEO external compatibility e NEO workspace visual no SHA candidato.
- [ ] **Step 7: Revisar diff final** confirmando nenhuma migration produtiva, grant, deploy ou URL/componente arbitrário.
- [ ] **Step 8: Criar checkpoint** `checkpoint/d010b-multimonitor-green-20260906` no SHA exato validado.
- [ ] **Step 9: Registrar `docs/releases/d010b-verification.md`** incluindo browser limitations, pop-up policy, fallback de BroadcastChannel, compatibilidade v1→v2 e quantidade N de superfícies.
- [ ] **Step 10: Promover PR funcional de Draft para Ready somente após todos os gates GREEN**; merge em `main` continua condicionado à autorização explícita.

## Self-review

- Spec coverage: domínio v2, migração v1, N telas, rota externa, manager, abertura coordenada, sincronização, hints de display, editor, segurança, resiliência e regressão estão mapeados.
- Persistência permanece na tabela D-010A; migration nova só será criada se um teste demonstrar incompatibilidade física real.
- Nenhum limite lógico pequeno foi introduzido; testes usam 12 superfícies como prova operacional sem transformar esse número em máximo.
- `BroadcastChannel` é opcional e degradável; backend permanece autoritativo.
- Não há placeholders/TBDs; assinaturas e nomes de componentes são consistentes entre tasks.
