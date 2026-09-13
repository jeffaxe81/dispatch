# D-012D — Tarefas e Responsáveis

Data: 2026-09-13

## Objetivo

A D-012D adiciona trabalho humano à engine stateful criada na D-012C sem introduzir uma segunda engine. `workflow_executions` continua representando a instância; `workflow_tasks` é uma entidade filha vinculada à execução, à versão congelada e ao nó atual.

## Modelo

Uma tarefa preserva:

- `executionId`;
- `workflowVersionId` congelado pela instância;
- `nodeId`;
- `status` (`open`, `in_progress`, `completed`, `cancelled`);
- `assigneeUserId`, quando houver responsável explícito;
- timestamps de claim, início, conclusão e cancelamento;
- auditoria com ator e `correlationId`.

A combinação `executionId + nodeId` é única para impedir duplicação lógica da mesma tarefa na mesma instância.

## Etapa humana

A D-012D não introduz um novo tipo de nó no validador legado. Um nó já suportado pode declarar em sua `configuration`:

```json
{
  "requiresHumanTask": true,
  "assigneeUserId": 11
}
```

O marcador é deliberadamente pequeno e preserva compatibilidade com definição, publicação e versionamento existentes. Um designer específico de tarefas permanece para ciclos futuros.

## Ciclo de vida

- criação: `open`;
- atribuição/reatribuição: mantém o estado e troca o responsável;
- claim: `open` sem responsável para `in_progress`, atribuindo o usuário que fez claim;
- start: `open` atribuída para `in_progress`, somente pelo responsável atual;
- complete: `in_progress` para `completed`, somente pelo responsável atual;
- cancel: `open` ou `in_progress` para `cancelled`.

`completed` e `cancelled` são estados terminais.

## Integração com a instância

Ao avançar para um nó com `requiresHumanTask=true`:

1. a transição é validada contra a versão congelada;
2. a instância muda para `waiting`;
3. a tarefa é criada ou reutilizada por `executionId + nodeId` na mesma transação;
4. a instância não pode usar o avanço normal enquanto estiver `waiting`.

A retomada usa `resumeManualWorkflowInstanceFromCompletedTask`. Ela exige que a tarefa informada pertença à mesma execução, versão e nó atual e esteja `completed`. A próxima transição continua validada pelo grafo congelado.

Cancelar uma instância também cancela tarefas `open`/`in_progress` ligadas a ela e registra auditoria de cada cancelamento dentro da mesma transação.

## Concorrência e segurança

`claim`, `start`, `complete`, assign e cancel de tarefa carregam a tarefa para atualização dentro de transação. O domínio falha fechado para transições inválidas e para usuário diferente do responsável atual nas operações que exigem ownership funcional.

Esse ownership não substitui RBAC. Permissão formal e isolamento multi-tenant de definições, instâncias e tarefas pertencem à D-012E.

A D-012D permanece em modo de simulação e não introduz chamadas externas nem escrita no domínio de Ocorrências.

## Rollout

A migration D-012D deve existir e ser aplicada antes de iniciar código que consulte `workflow_tasks`. A ordem operacional futura é:

1. backup/verificação do banco;
2. aplicar a migration que cria `workflow_tasks` e seus índices/constraints;
3. validar a tabela e a chave única `execution_id + node_id`;
4. iniciar a aplicação nova;
5. executar smoke de criação, claim/start/complete, espera/retomada e cancelamento.

A aplicação da migration em ambiente não faz parte desta microentrega de código.

## Rollback

Rollback da aplicação ocorre primeiro. A tabela aditiva pode permanecer durante estabilização porque o código anterior não a consulta. Remoção da tabela, se algum dia necessária, deve ocorrer em manutenção separada e somente após confirmação de que nenhum binário D-012D a utiliza.

## Fora do escopo

- RBAC/multi-tenant formal;
- responsável por equipe/papel;
- SLA e escalonamento;
- notificações;
- eventos/gatilhos externos;
- integração D-008;
- inbox/Kanban;
- designer visual novo;
- deploy, grants ou migration aplicada automaticamente.
