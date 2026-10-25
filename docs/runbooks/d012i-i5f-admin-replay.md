# D-012I I5F — replay administrativo seguro da quarentena SLA

## Objetivo

Permitir que uma intenção SLA em `dead_letter` seja reaberta administrativamente como `pending`, de forma explícita, auditável e tenant-scoped.

O replay **não** representa entrega de notificação, leitura humana, escalonamento efetivo ou alteração de estado da Ocorrência.

## Pré-condições

O endpoint tRPC é exposto em:

`workflowSlaAdminReplay.replay`

A execução só é habilitada quando:

- `AXE_RUNTIME_ENV=homologation`;
- `AXE_SLA_I5F_ENABLED=true`;
- usuário autenticado e ativo;
- permissão `workflow.execute`;
- autorização administrativa;
- tenant ativo resolvido pelo servidor;
- intenção no mesmo tenant;
- estado atual `dead_letter`;
- tarefa vinculada ainda `open` ou `in_progress`;
- justificativa entre 3 e 1000 caracteres.

O cliente não informa `organizationId`, `actorUserId`, `administratorApproved` nem relógio.

## Transação

A transação bloqueia e valida:

1. ponteiro da intenção pelo `intentId + organizationId`;
2. tarefa;
3. escopo da execução;
4. execução;
5. intenção SLA.

O CAS de replay exige, no mínimo:

- `id`;
- `organization_id`;
- `delivery_version`;
- `status = dead_letter`;
- tarefa;
- versão do workflow;
- nó;
- tipo do evento;
- correlação;
- prazo congelado.

Somente `affectedRows === 1` é sucesso.

## Mudança permitida

`dead_letter → pending`

Ao reabrir:

- incrementa `delivery_version`;
- zera `delivery_attempts`;
- limpa owner/token/expiração do lease;
- limpa próximo retry;
- limpa `deliveredAt`;
- limpa `deadLetteredAt`;
- preserva identidade, tarefa, tenant, evento, correlação e prazo.

Não há UPDATE de tarefa ou Ocorrência.

## Auditoria

A auditoria é gravada na mesma transação com ação:

`workflow_sla.admin_replay`

Inclui ator, tenant, tarefa, versão anterior/nova, tentativas, justificativa, instante de replay e código de falha anterior.

Falha ao gravar auditoria deve causar rollback do replay.

Tokens de lease não são gravados em auditoria.

## Falhas esperadas

O replay falha fechado quando:

- feature gate desligado;
- usuário/permissão/admin inválidos;
- tenant não resolvido;
- intenção fora do escopo;
- estado diferente de `dead_letter`;
- tarefa concluída/cancelada;
- snapshot divergente;
- conflito CAS;
- falha de auditoria;
- banco indisponível.

## Homologação

Gates técnicos esperados no mesmo head:

- `pnpm security:check`;
- `pnpm check`;
- suíte completa;
- `pnpm build`;
- empacotamento Docker;
- workflow `SLA MySQL homologation`.

A homologação MySQL usa banco descartável. Não executar a migration ou replay contra banco operacional por inferência deste runbook.

## Produção

Este runbook não autoriza:

- merge em `main`;
- migration real;
- grants;
- deploy;
- scheduler automático;
- notificações externas;
- replay em produção;
- remoção de checkpoints.
