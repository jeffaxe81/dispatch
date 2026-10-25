# D-012I I5D — aceitação transacional de notificações internas

## Resultado e alcance

Esta etapa acrescenta uma caixa interna durável de eventos SLA. `delivered` significa exclusivamente **aceito no armazenamento interno**, com recibo correspondente, atualização da intenção e auditoria na mesma transação. Não comprova envio a um canal externo, leitura humana ou apresentação em uma tela; a interface de consulta ainda depende de autorização e desenvolvimento próprios.

O código é invocado manualmente em homologação. Não há rota HTTP, CLI, timer, cron, consumidor automático, integração com o módulo externo de notificações ou reatribuição de tarefas. A função `confirmWorkflowSlaI5dHomologation` usa o relógio do servidor; o relógio injetável pertence ao serviço para testes determinísticos.

## Pré-condições de um ensaio autorizado

1. Usar banco descartável de homologação, separado de qualquer base operacional.
2. Integrar/revalidar em ordem as dependências #116, #117, #120, #121, #122, #124 e #125. Esta alteração parte do HEAD `bcf34a1` da #125.
3. Validar backup e reversão; aplicar 0014–0017 **somente** no ambiente autorizado. A 0017 está versionada, não é aplicada pela importação do módulo.
4. Exigir `AXE_RUNTIME_ENV=homologation` e `AXE_SLA_I5D_ENABLED=true`. Qualquer valor diferente bloqueia a operação antes da conexão. O padrão é desligado.
5. O chamador deve autenticar e autorizar o administrador operacional da organização. `operatorApproved: true` registra uma pré-condição interna; não é autenticação nem concessão de permissão. Não expor esta função por um router antes de implementar RBAC e testes de fronteira.
6. Reservar uma intenção vencida pelo coordenador e manter `leaseToken` somente na memória privada do harness aprovado. Encaminhar `intentId`, `organizationId`, `expectedVersion`, `workerId`, `leaseToken` e a aprovação de sessão ao confirmador. Não registrar o token. O modo I5C `lease_probe` deliberadamente descarta seus tokens e não deve ser usado como mecanismo de obtenção de credenciais para este fluxo.

## Invariantes da transação

- A descoberta inicial do ponteiro exige organização e identificador da intenção. Depois são bloqueadas tarefa, fronteira organizacional, execução e intenção; o ponteiro é revalidado sob lock.
- A versão publicada deve corresponder à tarefa e à execução; o nó da intenção deve coincidir com o nó da tarefa. A correlação do SLA pertence à intenção congelada e deve coincidir com o recibo; `workflow_executions.correlation_id` pode mudar legitimamente quando o fluxo é cancelado/retomado e não invalida esse recibo. Tarefas `completed/cancelled` são colocadas em quarentena sem inserir notificação, desde que a confirmação ainda possua a reserva válida.
- O relógio é lido depois dos locks e da leitura do recibo. Reserva expirada, token/worker/versão obsoletos e evento futuro não podem confirmar entrega.
- `eventKey = workflow.sla.v1:<organizationId>:<taskId>:<eventKind>` é estável entre tentativas. Índices únicos por intenção e organização/evento impedem duplicação.
- A consulta de recibo usa leitura corrente com `FOR UPDATE`. Sob `REPEATABLE READ`, uma leitura consistente poderia deixar de enxergar um recibo confirmado enquanto o segundo worker esperava o lock.
- CAS compara tenant, versão, status, token, proprietário, validade da reserva e metadados congelados. Só uma linha alterada autoriza a inserção do recibo.
- Recibo, estado `delivered` e auditoria são atômicos. Erro de banco, de integridade, de auditoria ou desligamento da flag durante o callback causa rollback. Um deadlock também deve falhar sem efeitos parciais.
- Replay só retorna `duplicate` se o snapshot completo do recibo corresponder ao estado confirmado. `delivered` sem recibo é uma inconsistência, nunca confirmação implícita.
- Token e estado completo da reserva não são serializados na auditoria ou no recibo. O registro contém apenas identificadores, correlação, tipo de evento, instante e versão.

## Schema e reversão

A 0017 cria `workflow_sla_notifications`, índices de deduplicação e índice de consulta por tenant/instante. Timestamps usam epoch-ms; a nova tabela não depende do fuso da sessão SQL. As FKs `RESTRICT` preservam os recibos e podem bloquear exclusão de tarefas, intenções, organizações ou versões que já tenham notificações. Uma futura política de retenção deve tratar essas referências explicitamente.

Reversão operacional: desligar a flag, aguardar/encerrar o ensaio e voltar ao código anterior preservando a tabela e seus recibos. Não apagar registros para simular reversão de uma confirmação. Não executar redução de enum ou remoção de colunas dos ciclos anteriores.

## Evidências e gates restantes

As suítes locais exercitam confirmação, replay concorrente, tarefa encerrada, isolamento de tenant, snapshot divergente, reserva expirada/obsoleta, relógio inválido, rollback e gates. No adapter, Drizzle real gera SQL e conduz `begin/commit/rollback` sobre um substituto da conexão mysql2. Esse teste **não** comprova contenção física no MySQL.

Antes de habilitar qualquer fluxo operacional, executar com conexões MySQL independentes:

1. Duas confirmações para a mesma intenção: exatamente um recibo e uma auditoria; a segunda confirmação retorna replay.
2. Encerramento da tarefa concorrente à confirmação: a ordem dos locks determina aceitação anterior ao encerramento ou quarentena posterior; não aceitar uma tarefa já encerrada no ponto da confirmação.
3. Mudança de tenant/versão/nó durante a descoberta: nenhuma gravação com snapshot divergente. Mudança legítima da correlação atual da execução preserva a correlação original da intenção/recibo.
4. Falha entre CAS, recibo e auditoria: rollback sem sucesso aparente; validar perda de conexão e deadlock.
5. Lease expirada durante espera por lock e leitura de recibo sob `REPEATABLE READ`.
6. DDL 0017 sobre base equivalente à produção, índices únicos, restrições de exclusão e compatibilidade de rollback.

Ainda pendentes: homologação MySQL real, RBAC de eventual ponto operacional, UI de notificações, observabilidade da quarentena, replay administrativo autorizado e automação/scheduler. Intenções de tarefas inativas com lease já expirada precisam de tratamento de reconciliação próprio; este confirmador não se apropria de reservas vencidas. Canais externos exigem adapter e recibo do destino e continuam fora desta etapa.

## Validação local desta entrega — 18/10/2026

| Verificação | Resultado observado |
| --- | --- |
| `corepack pnpm test --maxWorkers=2 --minWorkers=1` | 314 arquivos; **1.482/1.482 testes aprovados**, incluindo 50 cenários I5D |
| `corepack pnpm check` | Aprovado após corrigir a discriminação TypeScript herdada da I5A |
| `corepack pnpm security:check` | Aprovado; 18 migrações versionadas e invariantes existentes preservados |
| `corepack pnpm build` | Aprovado; avisos existentes sobre analytics e tamanho/divisão de chunks |
| Revisão independente | Um achado relevante sobre correlação mutável; dois testes falharam antes da correção e passaram depois; suíte integral reexecutada |
| `corepack pnpm test:integration --maxWorkers=2 --minWorkers=1` | Bloqueado no preparo por ausência das variáveis obrigatórias de um ambiente de testes; nenhum banco acessado |

A configuração de qualidade agora inclui PRs cuja base corresponde a `feat/d012i-*`. O teste da configuração foi atualizado preservando permissões de leitura, pushes apenas em `main`, ações fixadas por SHA e ausência de deploy. O status remoto da execução deve ser consultado na PR; esta tabela registra evidências locais.
