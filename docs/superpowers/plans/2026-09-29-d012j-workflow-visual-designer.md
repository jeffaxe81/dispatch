# D-012J — Designer Visual de Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que administradores autorizados configurem e validem visualmente um Workflow usando somente o catálogo e os contratos permitidos.

**Architecture:** Evoluir o `WorkflowBuilderPage` existente, sem criar segundo editor ou outro formato de definição. O cliente projeta o contrato tipado para interação imediata; `normalizeWorkflowDefinition` e `validateWorkflowDefinition` continuam sendo a autoridade no salvamento e na publicação.

**Tech Stack:** React 19, TypeScript, Wouter, tRPC, Zod, Vitest e Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-d012j-workflow-visual-designer-design.md`

## Global Constraints

- Partir de `checkpoint/d012j-design-20260929` (`76556b3`) e preservar branch/checkpoint por microentrega.
- Reutilizar `client/src/pages/WorkflowBuilderPage.tsx` e o contrato existente; sem editor JSON, executor, barramento, conector ou formato paralelo.
- Tenant, RBAC, normalização e publicação são server-authoritative; nenhum identificador de tenant, ator ou correlação vem do canvas.
- Simulation-only: sem migração, banco de produção, timer, chamada externa, mutação automática de Ocorrências, deploy, alteração de `main` ou merge automático.
- Aplicar TDD RED → mudança mínima → GREEN e um commit por tarefa.

## Review Focus

- Tipo desconhecido de versão antiga fica visível como inválido e nunca editável/criável (Task 1).
- Decisão com duas arestas para o mesmo destino fica bloqueada antes de publicar (Task 2).
- SLA ou formulário inválido aparece no editor e ainda é recusado pelo servidor (Task 3).
- Usuário sem `workflow.edit` apenas visualiza; não altera, conecta ou remove nós (Task 4).
- Rascunho não altera versão publicada e o estado/versão são inequívocos (Task 4).

## File Structure

- Modify: `client/src/pages/WorkflowBuilderPage.tsx` — catálogo, inspector, conexões, validação e estado.
- Modify: `client/src/pages/WorkflowBuilderPage.test.tsx` — contrato isolado de catálogo/inspector.
- Modify: `client/src/pages/WorkflowBuilderPage.full.test.tsx` — interação, permissões, estado e versão.
- Modify only if RED demonstrar lacuna canônica: `server/dbLegacy.ts` e `server/routers.ts`.
- Test only if contrato servidor mudar: `server/workflows.router.test.ts`.

---

### Task 1: Catálogo visual fechado e compatível

**Files:**
- Modify: `client/src/pages/WorkflowBuilderPage.tsx:17-145`
- Modify: `client/src/pages/WorkflowBuilderPage.test.tsx`

**Interfaces:**
- Consumes: definição normalizada e `getWorkflowNodeConfigurationErrors` existentes.
- Produces: `workflowDesignerPalette`, `isWorkflowDesignerNodeType(type: string): type is WorkflowDesignerNodeType` e inspector para D-012G/H/I.

- [ ] **Step 1: Write failing tests**

Testar renderização de `decision.condition`, `task.human` com SLA e `form.d008`; um tipo persistido desconhecido deve ser somente leitura e não possuir item de paleta.

- [ ] **Step 2: Run RED**

Run: `node_modules/.bin/vitest run --config vitest.config.ts client/src/pages/WorkflowBuilderPage.test.tsx`

Expected: FAIL, pois o catálogo atual não conhece os tipos D-012G/H/I.

- [ ] **Step 3: Implement minimal catalog**

Definir conjunto tipado de nós, configurações iniciais e campos de inspector. Tipo legado/desconhecido é preservado somente para visualização e gera erro local; nunca pode ser criado ou ter tipo alterado.

- [ ] **Step 4: Run GREEN**

Run: `node_modules/.bin/vitest run --config vitest.config.ts client/src/pages/WorkflowBuilderPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/WorkflowBuilderPage.tsx client/src/pages/WorkflowBuilderPage.test.tsx
git commit -m "feat: alinhar catálogo visual do workflow"
```

### Task 2: Conexões explícitas e decisão por arestas

**Files:**
- Modify: `client/src/pages/WorkflowBuilderPage.tsx:86-145,180-310`
- Modify: `client/src/pages/WorkflowBuilderPage.full.test.tsx`

**Interfaces:**
- Consumes: `FlowDefinition`, `FlowEdge` e `validate(definition)`.
- Produces: `connectNodes(): void` e `synchronizeDecisionTargets(definition: FlowDefinition): FlowDefinition`.

- [ ] **Step 1: Write failing tests**

Montar gatilho → decisão → dois destinos e verificar destinos distintos derivados pelas conexões. Cobrir auto-conexão, aresta duplicada e dois caminhos para o mesmo destino como erro bloqueante.

- [ ] **Step 2: Run RED**

Run: `node_modules/.bin/vitest run --config vitest.config.ts client/src/pages/WorkflowBuilderPage.full.test.tsx`

Expected: FAIL porque a decisão atual aceita destinos fora das arestas.

- [ ] **Step 3: Implement connection semantics**

Usar somente nós presentes; sincronizar/remover destinos de decisão ao alterar arestas. Não criar arestas implícitas e manter o servidor como validador final.

- [ ] **Step 4: Run GREEN**

Run: `node_modules/.bin/vitest run --config vitest.config.ts client/src/pages/WorkflowBuilderPage.full.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/WorkflowBuilderPage.tsx client/src/pages/WorkflowBuilderPage.full.test.tsx
git commit -m "feat: validar conexões visuais do workflow"
```

### Task 3: Pré-validação canônica antes de salvar/publicar

**Files:**
- Modify: `client/src/pages/WorkflowBuilderPage.tsx:86-145,260-315`
- Modify: `client/src/pages/WorkflowBuilderPage.full.test.tsx`
- Modify only if RED provar lacuna: `server/dbLegacy.ts:1755-1950`, `server/routers.ts`
- Test only if servidor mudar: `server/workflows.router.test.ts`

**Interfaces:**
- Consumes: `validateWorkflowDefinition(value, { forPublication?: boolean })`.
- Produces: `toDesignerValidation(definition: FlowDefinition): { errors: string[]; warnings: string[] }`.

- [ ] **Step 1: Write failing tests**

Cobrir SLA inválido e formulário D-008 incompleto no painel; salvar deve ser bloqueado diante de erro e a publicação deve apresentar a recusa canônica.

- [ ] **Step 2: Run RED**

Run: `node_modules/.bin/vitest run --config vitest.config.ts client/src/pages/WorkflowBuilderPage.full.test.tsx server/workflows.router.test.ts`

Expected: FAIL pois o builder antecipa somente parte dos erros de configuração.

- [ ] **Step 3: Implement minimal validation bridge**

Centralizar a transformação de erros/avisos. Apenas se necessário, expor prévia read-only do relatório canônico via tRPC; não duplicar validação de SLA/formulário no cliente.

- [ ] **Step 4: Run GREEN**

Run: `node_modules/.bin/vitest run --config vitest.config.ts client/src/pages/WorkflowBuilderPage.full.test.tsx server/workflows.router.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/WorkflowBuilderPage.tsx client/src/pages/WorkflowBuilderPage.full.test.tsx server/dbLegacy.ts server/routers.ts server/workflows.router.test.ts
git commit -m "feat: antecipar validação canônica no designer"
```

### Task 4: Estado, versão, permissão e acessibilidade

**Files:**
- Modify: `client/src/pages/WorkflowBuilderPage.tsx:230-315`
- Modify: `client/src/pages/WorkflowBuilderPage.full.test.tsx`
- Test: `server/workflow/workflowPublicationArchitecture.test.ts`

**Interfaces:**
- Consumes: `workflow.currentVersion`, `workflow.active`, `access.me`, `workflows.update` e `workflows.setActive`.
- Produces: estado claro de rascunho/publicado e controles inacessíveis sem `workflow.edit`/`workflow.activate`.

- [ ] **Step 1: Write failing tests**

Cobrir usuário somente `workflow.view`, rascunho sujo que não permite publicar, versão publicada preservada e alertas com papel acessível.

- [ ] **Step 2: Run RED**

Run: `node_modules/.bin/vitest run --config vitest.config.ts client/src/pages/WorkflowBuilderPage.full.test.tsx server/workflow/workflowPublicationArchitecture.test.ts`

Expected: FAIL nos estados/controles que ainda não distinguem rascunho e publicação.

- [ ] **Step 3: Implement hardening**

Exibir estado de edição e versão persistida sem sugerir ativação real; manter controles mutáveis inacessíveis sem permissão. Nenhuma permissão é decidida no cliente.

- [ ] **Step 4: Run GREEN**

Run: `node_modules/.bin/vitest run --config vitest.config.ts client/src/pages/WorkflowBuilderPage.full.test.tsx server/workflow/workflowPublicationArchitecture.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/WorkflowBuilderPage.tsx client/src/pages/WorkflowBuilderPage.full.test.tsx server/workflow/workflowPublicationArchitecture.test.ts
git commit -m "feat: endurecer estado e permissões do designer"
```

### Task 5: Verificação, checkpoint e PR Draft

**Files:**
- Create: `docs/superpowers/reports/2026-09-29-d012j-verification.md`
- Modify: `docs/superpowers/plans/2026-09-29-d012j-workflow-visual-designer.md`

**Interfaces:**
- Consumes: commits GREEN J1–J4 e resultados dos gates.
- Produces: relatório com SHAs, escopo, exclusões, evidências, limitações e checkpoint.

- [x] **Step 1: Record final gates**

Registrar `pnpm security:check`, `pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, `docker compose config --quiet` e `docker compose build api web`, distinguindo execução, não aplicável e bloqueio externo.

- [x] **Step 2: Run gates and inspect branch**

Run os gates e `git status --short && git diff --check <base>...HEAD`. Para sandbox sem TCP, registrar `EPERM` e arquivos afetados; não tratar como GREEN nem alterar código para contornar o ambiente.

- [x] **Step 3: Commit report and checkpoint**

```bash
git add docs/superpowers/reports/2026-09-29-d012j-verification.md docs/superpowers/plans/2026-09-29-d012j-workflow-visual-designer.md
git commit -m "docs: registrar verificação D-012J"
git tag -a checkpoint/d012j-green-20260929 -m "D-012J verification checkpoint"
```

- [ ] **Step 4: Open/update only Draft PR**

Registrar SHA, escopo, exclusões e gates no PR Draft da pilha adequada. Não marcar Ready, não fazer merge e não executar deploy.

## Execution Notes

As tarefas alteram o mesmo editor e devem ser executadas em sequência. Recomenda-se implementação nativa por este agente, com revisão independente da branch antes do PR Draft. Este plano não autoriza código até sua revisão humana.
