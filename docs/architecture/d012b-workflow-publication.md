# D-012B — Definição, versão e publicação de workflow

Data: 2026-09-13

## Objetivo

A D-012B separa explicitamente o que está em edição do que está efetivamente publicado no workflow legado de `SIMULAÇÃO / MOCK`.

- `currentVersion`: versão mais recente disponível para edição;
- `publishedVersion`: última versão promovida explicitamente por publicação;
- `active`: indica se a publicação está habilitada para execução simulada;
- `workflow_versions`: permanece append-only; publicar não altera uma versão existente.

A execução simulada e o retry deixam de resolver `currentVersion` e passam a resolver somente `publishedVersion`.

## Compatibilidade com o legado

O corpo legado de persistência foi preservado em `server/dbLegacy.ts`. `server/db.ts` funciona como fachada de compatibilidade e substitui explicitamente apenas as operações alteradas pela D-012B:

- `setSimulatedWorkflowActive`;
- `executeSimulatedWorkflow`;
- `retrySimulatedWorkflowExecution`.

O contrato transacional de jornada D-007A continua exposto diretamente na fachada para preservar sua fronteira arquitetural existente.

O mapeamento `workflowPublicationPointers` é uma projeção mínima da tabela física `workflows`, usada somente para a nova coluna `published_version`. Não cria uma nova tabela nem um segundo domínio de workflow.

## Ciclo de vida

### Novo workflow

1. nasce com `currentVersion = 1`;
2. `publishedVersion = null`;
3. `active = false`;
4. não pode ser executado.

### Edição

1. cria uma nova linha em `workflow_versions`;
2. incrementa `currentVersion`;
3. não altera `publishedVersion`;
4. uma publicação anterior continua estável.

### Publicação

1. valida a definição corrente com as regras de publicação;
2. mantém o histórico append-only;
3. define `publishedVersion = currentVersion`;
4. define `active = true` e `status = publicado`;
5. registra auditoria com o ponteiro anterior e o novo ponteiro.

### Desativação

1. define `active = false`;
2. preserva `publishedVersion`;
3. preserva histórico e auditoria;
4. bloqueia novas execuções.

### Execução e retry

1. exigem workflow ativo e de simulação;
2. exigem `publishedVersion` válido;
3. carregam a linha correspondente de `workflow_versions`;
4. falham fechado se o ponteiro ou a versão não existir;
5. não resolvem o rascunho por `currentVersion`;
6. continuam sem chamadas externas (`externalRequests: 0`).

## Migration

Arquivo: `drizzle/0009_d012b_workflow_published_version.sql`.

A migration é aditiva:

1. adiciona `published_version INT NULL`;
2. faz backfill de workflows com `workflow_status = 'publicado'`, usando `current_version`;
3. não remove dados;
4. não executa deploy, grant ou ativação externa.

A D-012B apenas versiona a migration no repositório. Aplicação em ambiente é uma ação operacional separada e explicitamente aprovada.

## Ordem de rollout futura

Quando a versão for efetivamente implantada em algum ambiente, a ordem segura é:

1. backup/verificação operacional do banco;
2. aplicar migration `0009`;
3. validar backfill de `published_version` para workflows publicados;
4. somente então iniciar a aplicação que consulta `published_version`;
5. executar smoke de criação, edição, publicação, desativação e execução simulada.

Não iniciar o código novo antes da coluna existir, pois a resolução de publicação é deliberadamente fail-closed.

## Rollback

Rollback da aplicação deve ocorrer antes de qualquer remoção da coluna.

1. interromper nova versão da aplicação;
2. restaurar versão anterior da aplicação;
3. manter `published_version` no banco durante a estabilização — a coluna é aditiva e não interfere no código anterior;
4. somente em manutenção separada, se realmente necessário, remover a coluna após confirmação de que nenhum binário novo a utiliza.

Não há rollback destrutivo automático nesta entrega.

## Limites da D-012B

A entrega não cria:

- engine novo de instâncias;
- tarefas ou assignees;
- RBAC/multi-tenant formal do novo engine;
- gatilhos externos novos;
- integração funcional D-008;
- SLA/escalation;
- designer visual novo;
- inbox/Kanban novo;
- deploy, migration aplicada ou grants.

Esses itens permanecem nas microentregas D-012C em diante.
