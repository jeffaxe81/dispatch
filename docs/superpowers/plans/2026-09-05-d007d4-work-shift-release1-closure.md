# D-007D4 — Fechamento da Jornada Release 1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encerrar tecnicamente o épico Controle de Jornada Release 1.0 com rastreabilidade, inventários, runbook, regressão fresca, evidência final e checkpoint imutável, sem adicionar nova regra de negócio.

**Architecture:** D-007D4 é predominantemente documental e verificatório. Parte do checkpoint homologado D-007D3 e consolida D-007A/B/C/D1/D2/D3; código somente pode mudar se lacuna real for primeiro demonstrada por teste RED.

**Tech Stack:** TypeScript, Node.js, tRPC, Drizzle ORM/MySQL, Vitest, React/Vite, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-05-d007d4-work-shift-release1-closure-design.md`

## Global Constraints
- Base D-007D3: `f0d3da908d2ac8a1b48d9cd76f3960e10e65591a`.
- Sem funcionalidade nova, migration real, grants, merge ou deploy.
- Evidência somente com SHAs/contagens/resultados reais.
- Gate vermelho bloqueia 100% técnico.
- Código somente após RED demonstrando lacuna concreta.

### Task 1 — Inventário factual
- [ ] Validar checkpoints D-007A/B/C/D1/D2/D3 nos refs/PRs reais.
- [ ] Criar `docs/D-007D4-WORK-SHIFT-RELEASE1-EVIDENCE.md` como `EM HOMOLOGAÇÃO`.
- [ ] Mapear requisito → implementação → API → teste → checkpoint.
- [ ] Célula sem evidência vira bloqueio explícito.
- [ ] Commit e checkpoint `checkpoint/d007d4-task1-inventory-20260905`.

### Task 2 — tRPC, RBAC e migrations
- [ ] Confrontar `server/rootRouter.ts` com `docs/TRPC_CONTRACT_COVERAGE.md`.
- [ ] Relacionar procedure à permissão server-side e teste.
- [ ] Confirmar ausência de grants automáticos.
- [ ] Inventariar migrations reais, dependências, objetos, pré/pós-condições e recuperação.
- [ ] Inventário desatualizado exige RED antes de correção; sem lacuna, não alterar código.
- [ ] Checkpoint `checkpoint/d007d4-task2-contracts-rbac-migrations-20260905`.

### Task 3 — Runbook futuro
- [ ] Criar `docs/D-007D4-WORK-SHIFT-RELEASE1-RUNBOOK.md`.
- [ ] Documentar backup/checkpoint, versão, janela, banco, variáveis, permissões e observabilidade.
- [ ] Documentar ordem exata das migrations e validações.
- [ ] Smoke tests: sessão, pausa, escala/12x36, elegibilidade, despacho antes do GIS, ajuste, relatório/export, cobertura e alerta.
- [ ] Definir abort/rollback/recuperação e incluir `RUNBOOK NÃO EXECUTADO — SEM DEPLOY/MIGRATION REAL`.
- [ ] Checkpoint `checkpoint/d007d4-task3-runbook-20260905`.

### Task 4 — Regressão fresca
- [ ] Ler comandos reais no package/workflows.
- [ ] Executar CI no SHA candidato e registrar IDs/resultados reais.
- [ ] Confirmar D-007A/B/C/D1/D2/D3, elegibilidade antes de GIS/OSRM e isolamento organização/unidade.
- [ ] Confirmar no mesmo SHA: Qualidade, GIS visual, NEO external e NEO workspace visual.
- [ ] Gate vermelho mantém `EM HOMOLOGAÇÃO`; exigir RED para mudança de código.
- [ ] Registrar contagens reais após execução fresca.

### Task 5 — Encerramento
- [ ] Self-review sem placeholders/números presumidos/SHAs não verificados.
- [ ] Marcar `CONCLUÍDO TECNICAMENTE — RELEASE 1.0` apenas com gates verdes no mesmo SHA.
- [ ] Atualizar `todo.md`: `Controle de Jornada — 100% tecnicamente concluído para Release 1.0 — não implantado em produção`.
- [ ] Commit final e nova verificação.
- [ ] Criar `checkpoint/d007d4-work-shift-release1-closure-20260905` no SHA homologado.
- [ ] Manter PR Draft baseado no D-007D3; sem merge/deploy/migration real.

## Critério de saída
Tasks 1–5 completas + gates verdes no mesmo SHA + checkpoint definitivo. Produção permanece fase separada e requer autorização explícita.