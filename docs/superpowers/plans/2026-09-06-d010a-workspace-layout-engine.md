# D-010A Workspace e Layout Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a Home do AXE Dispatch em um workspace operacional configurável, persistido no backend, com catálogo seguro de widgets e fallback resiliente, preservando o comportamento atual para usuários sem personalização.

**Architecture:** Preservar `DashboardLayout`, Wouter, tRPC e RBAC atuais. Extrair os blocos da Home em widgets registrados, persistir `WorkspaceLayout` versionado por tenant/usuário e introduzir um `WorkspaceCanvas` que opera em modo leitura por padrão e modo explícito de personalização. O modelo deve ser compatível com futura projeção multi-monitor sem implementar D-010B nesta fase.

**Tech Stack:** React 19, TypeScript 5.9, Wouter 3, tRPC 11, Drizzle ORM/MySQL, Zod 4, Vitest, Testing Library, Tailwind, `react-resizable-panels` apenas onde aplicável; grid 2D deverá ser implementado com dependência compatível/licença permissiva ou camada própria mínima após verificação registrada.

**Spec:** `docs/superpowers/specs/2026-09-06-d010-workspace-multimonitor-design.md`

## Global Constraints

- `tenantId` e `userId` são definidos exclusivamente pelo contexto autenticado do servidor.
- `localStorage` não é fonte autoritativa de layout.
- Apenas `widget.type` registrados em catálogo seguro podem ser persistidos/renderizados.
- Layout inválido nunca pode inutilizar a central operacional.
- D-010A não altera regras de negócio de ocorrência, GIS, jornada, telecom ou despacho.
- Migration, se criada, permanece versionada e não é aplicada automaticamente em banco real.
- Nenhum deploy produtivo, grant automático ou remoção de checkpoint faz parte desta implementação.
- TDD obrigatório: RED → GREEN → regressão.

---

### Task 1: Domínio e schema do WorkspaceLayout

**Files:**
- Create: `shared/workspaceLayout.ts`
- Create: `shared/workspaceLayout.test.ts`

**Interfaces:**
- Produces: `WorkspaceWidgetType`, `WorkspaceWidgetInstance`, `WorkspaceLayout`, `workspaceWidgetInstanceSchema`, `workspaceLayoutSchema`, `normalizeWorkspaceLayout(input, allowedTypes)`.

- [ ] **Step 1: Escrever testes RED** cobrindo layout válido, `type` desconhecido, dimensões inválidas, versão inválida e remoção segura de widgets não permitidos.
- [ ] **Step 2: Executar** `pnpm vitest run shared/workspaceLayout.test.ts` e confirmar falha.
- [ ] **Step 3: Implementar** schemas Zod com `version: 1`, `instanceId`, `type`, `x`, `y`, `w`, `h`, `settings` e função de normalização que nunca aceita tipos fora de `allowedTypes`.
- [ ] **Step 4: Executar novamente** e confirmar GREEN.
- [ ] **Step 5: Commit** `feat(d010a): add workspace layout domain`.

### Task 2: Catálogo seguro de widgets

**Files:**
- Create: `client/src/workspace/widgetRegistry.ts`
- Create: `client/src/workspace/widgetRegistry.test.ts`

**Interfaces:**
- Consumes: `WorkspaceWidgetType`.
- Produces: `WorkspaceWidgetDefinition`, `workspaceWidgetRegistry`, `getWorkspaceWidgetDefinition(type)`, `listAllowedWorkspaceWidgets(capabilities)`.

- [ ] **Step 1: Escrever testes RED** para catálogo fechado, ausência de componente arbitrário, filtro por capability e defaults de dimensões/settings.
- [ ] **Step 2: Rodar** `pnpm vitest run client/src/workspace/widgetRegistry.test.ts` e confirmar falha.
- [ ] **Step 3: Implementar catálogo inicial** com `operational-map`, `metrics`, `priority-queue`, `incidents`, `teams`, `work-shift` e metadados de dimensões/capabilities.
- [ ] **Step 4: Rodar testes** e confirmar GREEN.
- [ ] **Step 5: Commit** `feat(d010a): add secure workspace widget registry`.

### Task 3: Persistência Drizzle e contrato tenant-scoped

**Files:**
- Create: `drizzle/workspaceLayoutSchema.ts`
- Modify: `drizzle/schema.ts`
- Create: `server/workspace/workspaceLayoutRepository.ts`
- Create: `server/workspace/workspaceLayoutRepository.test.ts`
- Create: `drizzle/0007_d010a_workspace_layouts.sql`

**Interfaces:**
- Produces: `WorkspaceLayoutRepository` com `findOwn(tenantId,userId,name)`, `saveOwn(tenantId,userId,name,layout)`, `resetOwn(tenantId,userId,name)`.

- [ ] **Step 1: Escrever testes RED** exigindo tenant/user em todas as operações e rejeitando mismatch.
- [ ] **Step 2: Rodar teste isolado** e confirmar RED.
- [ ] **Step 3: Implementar schema** `workspace_layouts` com unicidade `(tenant_id,user_id,name)`, `layout_json`, `layout_version`, timestamps e sem FK/cascade destrutivo não necessário.
- [ ] **Step 4: Implementar repository contract + in-memory adapter de teste** tenant-scoped.
- [ ] **Step 5: Versionar migration SQL equivalente**, sem aplicar em banco real.
- [ ] **Step 6: Rodar testes** e confirmar GREEN.
- [ ] **Step 7: Commit** `feat(d010a): add tenant scoped workspace persistence`.

### Task 4: Serviço de resolução, fallback e reset

**Files:**
- Create: `server/workspace/workspaceLayoutService.ts`
- Create: `server/workspace/workspaceLayoutService.test.ts`

**Interfaces:**
- Consumes: `WorkspaceLayoutRepository`, `normalizeWorkspaceLayout`.
- Produces: `getOwnWorkspace(ctx,name)`, `saveOwnWorkspace(ctx,name,input)`, `resetOwnWorkspace(ctx,name)` e `DEFAULT_OPERATIONAL_WORKSPACE`.

- [ ] **Step 1: Escrever testes RED** para: layout inexistente → default; layout corrompido → fallback; widget sem capability → omitido; body tentando trocar tenant/user → ignorado; save válido → persistido; reset → remove configuração individual.
- [ ] **Step 2: Rodar** `pnpm vitest run server/workspace/workspaceLayoutService.test.ts`.
- [ ] **Step 3: Implementar serviço** usando identidade autenticada como única autoridade e default equivalente à Home atual.
- [ ] **Step 4: Rodar testes** e confirmar GREEN.
- [ ] **Step 5: Commit** `feat(d010a): add workspace resolution service`.

### Task 5: API tRPC do workspace

**Files:**
- Create: `server/routers/workspace.ts`
- Modify: `server/routers.ts`
- Create: `server/routers/workspace.test.ts`

**Interfaces:**
- Produces procedures: `workspace.getOwn`, `workspace.saveOwn`, `workspace.resetOwn`.

- [ ] **Step 1: Escrever testes RED** para autenticação, autorização, isolamento tenant/user, payload inválido e reset.
- [ ] **Step 2: Rodar testes isolados** e confirmar RED.
- [ ] **Step 3: Implementar router** com inputs estritos; `tenantId`/`userId` não fazem parte do contrato autoritativo.
- [ ] **Step 4: Rodar testes** e confirmar GREEN.
- [ ] **Step 5: Atualizar inventário tRPC** usando o script existente e revisar diff.
- [ ] **Step 6: Commit** `feat(d010a): expose workspace trpc api`.

### Task 6: Extrair widgets da Home sem alterar comportamento

**Files:**
- Create: `client/src/workspace/widgets/OperationalMapWidget.tsx`
- Create: `client/src/workspace/widgets/MetricsWidget.tsx`
- Create: `client/src/workspace/widgets/PriorityQueueWidget.tsx`
- Create: `client/src/workspace/widgets/IncidentsWidget.tsx`
- Create: `client/src/workspace/widgets/TeamsWidget.tsx`
- Create: `client/src/workspace/widgets/WorkShiftWidget.tsx`
- Modify: `client/src/pages/Home.tsx`
- Create: `client/src/workspace/widgets/widgets.test.tsx`

**Interfaces:**
- Produces widgets React independentes com props mínimas e sem duplicar regras de negócio.

- [ ] **Step 1: Escrever testes RED** que comprovem equivalência funcional mínima dos blocos existentes.
- [ ] **Step 2: Rodar testes** e confirmar RED.
- [ ] **Step 3: Extrair mapa, métricas e fila prioritária primeiro**, mantendo queries/refresh existentes.
- [ ] **Step 4: Adicionar wrappers resumidos para ocorrências, equipes e jornada** reutilizando contratos existentes.
- [ ] **Step 5: Rodar testes** e confirmar GREEN.
- [ ] **Step 6: Commit** `refactor(d010a): extract operational widgets`.

### Task 7: WorkspaceCanvas e modo Personalizar

**Files:**
- Create: `client/src/workspace/WorkspaceCanvas.tsx`
- Create: `client/src/workspace/WorkspaceToolbar.tsx`
- Create: `client/src/workspace/WorkspaceWidgetFrame.tsx`
- Create: `client/src/workspace/WorkspaceCanvas.test.tsx`
- Modify: `client/src/pages/Home.tsx`

**Interfaces:**
- Consumes: registry + `workspace.getOwn/saveOwn/resetOwn`.
- Produces: modo leitura padrão e modo edição explícito com mover/redimensionar/adicionar/remover/salvar/cancelar/resetar.

- [ ] **Step 1: Verificar e registrar compatibilidade/licença da solução de grid 2D escolhida**; se nenhuma dependência atender React 19/licença permissiva, usar camada própria baseada em CSS Grid + drag/resize controlado.
- [ ] **Step 2: Escrever testes RED** para edição desligada por padrão, toggle de personalização, adicionar/remover, salvar, cancelar e reset.
- [ ] **Step 3: Implementar `WorkspaceCanvas`** com estado local de rascunho e persistência apenas no comando Salvar.
- [ ] **Step 4: Garantir fallback visual** quando widget falha ou layout vem inválido.
- [ ] **Step 5: Rodar testes** e confirmar GREEN.
- [ ] **Step 6: Commit** `feat(d010a): add customizable workspace canvas`.

### Task 8: Segurança, regressão e acessibilidade operacional

**Files:**
- Modify: `scripts/security-regression-check.mjs`
- Create: `client/src/workspace/workspaceSecurity.test.tsx`
- Modify: `docs/TRPC_CONTRACT_COVERAGE.md`
- Modify: `docs/UI_ROUTE_STATE_MATRIX.md`

**Interfaces:**
- Produces invariantes automatizadas de segurança e cobertura de rota/contrato.

- [ ] **Step 1: Adicionar testes RED** exigindo catálogo fechado, tenant/user server-side e ausência de URL/component arbitrário em `layout_json`.
- [ ] **Step 2: Atualizar `security-regression-check.mjs`** para falhar se o router aceitar tenant/user autoritativos do body ou se catálogo seguro for removido.
- [ ] **Step 3: Validar teclado/foco nos controles de personalização** e labels acessíveis em ações críticas.
- [ ] **Step 4: Rodar** `pnpm security:check`, testes D-010A e scripts de cobertura.
- [ ] **Step 5: Commit** `test(d010a): harden workspace security and coverage`.

### Task 9: Gates finais e documentação de evidência

**Files:**
- Create: `docs/releases/d010a-verification.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: evidência auditável do candidato GREEN.

- [ ] **Step 1: Executar instalação congelada** conforme workflow do projeto.
- [ ] **Step 2: Executar** `pnpm security:check`.
- [ ] **Step 3: Executar** `pnpm check`.
- [ ] **Step 4: Executar** `pnpm test` e registrar contagem real de arquivos/testes.
- [ ] **Step 5: Executar** `pnpm build`.
- [ ] **Step 6: Executar regressões visuais relevantes** `pnpm test:gis-visual` e `pnpm test:neo-visual` quando o workflow disponibilizar o ambiente necessário.
- [ ] **Step 7: Criar checkpoint** `checkpoint/d010a-workspace-green-20260906` no SHA exato aprovado.
- [ ] **Step 8: Registrar `docs/releases/d010a-verification.md`** com evidências, migration não aplicada e limitações D-010B+.
- [ ] **Step 9: Abrir/promover PR funcional somente após GREEN**; merge em `main` continua exigindo autorização explícita.

## Self-review

- Cobertura da spec: modelo, catálogo, persistência, RBAC, fallback, Home incremental, preparação multi-monitor e testes estão mapeados.
- Sem placeholders/TBDs no plano.
- Tipos e nomes de interfaces são consistentes entre tasks.
- D-010B/C/D/E permanecem explicitamente fora desta implementação.
