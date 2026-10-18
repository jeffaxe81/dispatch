# D-012I I5E — ensaio físico de concorrência MySQL

## Finalidade

Comprovar no MySQL 8.4 as transações da I5A/I5B/I5D: disputa de reserva, recibo idempotente, estado corrente após espera por locks, rollback e tratamento de falhas. Esta suíte complementa os testes unitários da #126 e não ativa notificações operacionais.

A execução fica no workflow `SLA MySQL homologation`, em uma instância MySQL descartável do próprio job. A qualidade normal continua validando TypeScript, segurança, testes unitários, build e Docker. Ambas as execuções devem aprovar o mesmo HEAD antes de considerar este gate comprovado.

## Isolamento obrigatório

- Exige `NODE_ENV=test`, `AXE_RUNTIME_ENV=homologation` e `AXE_SLA_MYSQL_TESTS=true`.
- Usa exclusivamente `AXE_SLA_MYSQL_TEST_DATABASE_URL`; não utiliza `DATABASE_URL` da aplicação.
- Aceita apenas loopback, usuário `sla_test`, schema `dispatch_sla_homologation`, protocolo MySQL e URL sem parâmetros/fragmento. O usuário root é recusado.
- Antes de qualquer migration, consulta o nome real do banco e exige **zero tabelas**. Um schema já utilizado é recusado, inclusive se tiver o nome esperado. Não existe limpeza automática de um banco existente.
- Aplica o journal real completo, incluindo 0014–0017, no schema vazio. Cria somente fixtures sintéticas, sem credenciais operacionais ou chamadas externas.
- Cada conexão é física e identificada com `CONNECTION_ID()`. As sessões usam UTC e `REPEATABLE READ`, com timeout de lock de três segundos. O relógio do serviço é injetado nos ensaios de fronteira para evitar depender de esperas arbitrárias; a persistência, os locks e os erros vêm do MySQL real.
- Os observadores de SQL somente pausam depois de resultados reais para sincronizar a corrida. Não substituem linhas, `affectedRows`, transações ou respostas do banco.

## Cenários

| Ensaio | Evidência exigida |
| --- | --- |
| Conexões e schema | Três IDs distintos; isolamento/fuso confirmados; schema populado recusado |
| Claim simultâneo | Ambos leem versão zero antes de disputar; um vencedor e um conflito CAS; uma tentativa persistida |
| Confirmação simultânea | Ambos abrem snapshot antes do primeiro commit; uma entrega interna e um replay, um recibo e uma auditoria |
| Encerramento concorrente | Tarefa encerrada entre descoberta e lock vai para quarentena; nenhuma notificação |
| Tenant/fencing | Organização incorreta, token e versão obsoletos não gravam |
| Expiração | Consulta bloqueante é observada no servidor por pelo menos um segundo antes de avançar o relógio; lease vencida não confirma |
| Auditoria indisponível | CHECK descartável lança `ER_CHECK_CONSTRAINT_VIOLATED`; CAS e recibo sofrem rollback |
| Flag desligada | Desligamento após SQL de auditoria reverte todas as escritas da transação |
| Conexão perdida | Hook comprova CAS real com uma linha alterada e destrói a conexão; SQL seguinte falha por conexão fechada e leitura com lock confirma rollback |
| Deadlock | Cancelador e notificador disputam locks em ordens opostas; erro `ER_LOCK_DEADLOCK`, sem estado parcial |
| Integridade | Duplicação recebe `ER_DUP_ENTRY`; exclusão da tarefa referenciada recebe `ER_ROW_IS_REFERENCED_2` |
| Datas e replay | Epoch-ms UTC preservado; nova correlação da execução mantém replay; recibo adulterado é recusado |

## Execução e evidência

No ambiente dedicado configurado, executar `corepack pnpm test:sla-mysql`. Recriar a instância descartável antes de repetir; a suíte deliberadamente recusa um schema já preenchido. Não apontar este comando para uma instalação operacional.

O workflow provisiona a instância e usa um usuário restrito ao schema do ensaio. As senhas presentes no YAML são valores públicos exclusivos da instância descartável, não segredos de implantação. O relatório JUnit é preservado como artifact `d012i-i5e-sla-mysql` por 14 dias. Não contém tokens de implantação; os tokens das fixtures são aleatórios e sem acesso externo.

As suítes unitárias excluem arquivos `*.sla-mysql.test.ts`. O preparo global valida o opt-in antes de abrir conexões. A execução local sem as variáveis dedicadas deve bloquear, e esse bloqueio não é uma execução física bem-sucedida. O resultado físico deve ser consultado no check e no relatório do HEAD da PR.

A espera é observada por `SHOW FULL PROCESSLIST` nas conexões do próprio usuário, sem novos grants de `PROCESS`/`SUPER`; veja a [documentação do MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/show-processlist.html).

O ensaio também protege o contrato entre schema e ORM: `workflow_tasks.status` deve apontar para a coluna `status` da migration 0011. O mapeamento anterior usava `workflow_task_status`, que não existe no schema versionado; a correção alinha o SQL gerado sem renomear ou migrar dados.

## Limites preservados

O ensaio cobre MySQL 8.4 com sessões UTC em infraestrutura descartável. Não comprova compatibilidade com outras versões/fusos, desempenho sob carga, perdas de rede prolongadas, nem topologias de replicação/HA do cliente. A aplicação continua com o gate I5D desligado por padrão. RBAC de uma entrada operacional, UI, scheduler e replay administrativo permanecem entregas separadas. Não há merge, migração em base operacional ou deploy nesta etapa.
