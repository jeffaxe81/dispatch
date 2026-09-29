# D-012J — relatório de verificação

Data: 2026-09-29

## Escopo verificado

- Designer visual único em `WorkflowBuilderPage`, limitado ao catálogo permitido.
- Conexões e destinos de decisão derivados de arestas explícitas.
- Pré-validação canônica somente de leitura antes de salvar/publicar.
- Estado explícito de versão publicada e rascunho; controles mutáveis ocultos para `workflow.view`.
- Inventário tRPC atualizado para incluir `workflows.previewValidation` (116 procedimentos).

## Commits incluídos

| Entrega | Commit |
|---|---|
| J1 — catálogo/inspector | `edf78a3` |
| J2 — conexões/decisões | `61dd6b6` |
| J3 — pré-validação canônica | `e4ad573` |
| J4 — estado, versão e RBAC | `49710eb` |
| Inventário tRPC | `6e7ae4c` |

## Gates

| Gate | Resultado | Evidência |
|---|---|---|
| Testes focados do D-012J | PASS | 16/16: catálogo, editor completo, router, arquitetura de publicação e gerador tRPC. |
| TypeScript | PASS | `node_modules/.bin/tsc --noEmit`. |
| Segurança | PASS | Cópia limpa de `HEAD`: 15 migrações e 22 invariantes preservadas. |
| Build | PASS | `vite build` e bundle esbuild concluídos; somente avisos preexistentes de variáveis analíticas/chunk grande. |
| Suíte Vitest integral | BLOQUEADA externamente | 1360/1393 passaram; 33 falhas em 7 arquivos e 23 erros por `listen EPERM`/timeouts de HTTP, pois este sandbox não permite abrir portas TCP. |
| `pnpm security:check`, `pnpm check`, `pnpm test` | BLOQUEADOS pelo harness | O wrapper tenta criar `/root/.local`, que não é gravável; os equivalentes diretos acima foram executados. |
| E2E | Não aplicável | `test:e2e` não está definido em `package.json`. |
| Docker Compose | Bloqueado pelo ambiente | binário `docker` indisponível; nenhum compose/build foi iniciado. |

## Limites preservados

Não houve migração, restauração, acesso a banco de produção, timer, chamada externa, mutação automática de Ocorrência, deploy, merge nem alteração de `main`. O canvas permanece explicitamente em simulação/mock.

## Checkpoints

- `checkpoint/d012j-design-20260929` — `76556b3`
- `checkpoint/d012j-plan-20260929` — `9d2c398`
- `checkpoint/d012j-j1-green-20260929` — `edf78a3`
- `checkpoint/d012j-j2-green-20260929` — `61dd6b6`
- `checkpoint/d012j-j3-green-20260929` — `e4ad573`
- `checkpoint/d012j-j4-green-20260929` — `49710eb`
- `checkpoint/d012j-j3-contracts-20260929` — `6e7ae4c`

## Conclusão

O escopo D-012J está pronto para publicação controlada em branch e PR Draft. A suíte integral precisa ser repetida em CI/homologação com permissão de rede antes de qualquer promoção.
