# D-012J J6E — ponte autenticada dos heartbeats para prontidão SLA

## Escopo executado
- J6D já possui HMAC-SHA256, fonte por tenant+componente, TTL de 60 segundos, sequência monotônica e storage transacional MySQL.
- J6E adiciona `createSlaVerifiedComponentEmitter` para **uma** verificação explícita de liveness de um componente confiável, com resultado derivado de callback do próprio componente, nunca de parâmetros de cliente. Exceções do check resultam em **unhealthy**, não "healthy". Não inicia scheduler, timer, job ou serviço.
- J6E adiciona `createSlaAuthenticatedHeartbeatProbe`: lê apenas evidência de tenant/componente/fonte aprovados por configuração do servidor, TTL de emissão **e** recepção, relógio monotônico, sequence e estados conhecidos; troca de fonte/HA não herda saúde de emissor antigo. Falha vira `unknown`.
- A composição da API `workflowSlaOperational.diagnostic({})` passa a ligar os probes exclusivamente em modo de prévia J6C, com resolução de tenant autenticada do próprio endpoint. Em produção continua `disabled`, sem acessar o store.
- Teste de integração **E2E no MySQL 8.4 descartável**, com dois callbacks de componentes simulados: somente scheduler = `not_ready`, scheduler + adapter = `ready` *apenas no cenário artificial de homologação*, expiração = `not_ready`. Também testa fontes cruzadas e multi-tenant. Esta prova não equivale a instâncias ativas de scheduler/adapters em operação.

## Configuração restrita de leitura (somente homologação)
**Todos** necessários:
```text
NODE_ENV != production
AXE_RUNTIME_ENV=homologation
AXE_SLA_READINESS_PREVIEW_ENABLED=true
AXE_SLA_HEARTBEAT_READ_ENABLED=true
AXE_SLA_HEARTBEAT_TENANT_ID=<id do tenant autorizado>
AXE_SLA_HEARTBEAT_SOURCE_SCHEDULER=<source id aprovado para scheduler>
AXE_SLA_HEARTBEAT_SOURCE_ADAPTER=<source id aprovado para adapter>
```
Sem config, sem migration ou com fonte/tenant errado => `unknown`. Ler não requer chave HMAC porque a autenticidade da gravação foi validada na ingestão J6D, mas exige fonte explicitamente allowlisted **em cada consulta**. Não são aceitos identificadores de fonte ou tenant pelo usuário via tRPC.

## Emissão: portões e limitações
Emissão está acessível apenas **como biblioteca de composição interna** e requer também `AXE_SLA_HEARTBEAT_INGEST_ENABLED=true`, chaves únicas de pelo menos 32 bytes por tenant/componente e callback real de health/liveness. **Não existe emissor conectado ao runtime do scheduler**: o projeto dispõe apenas de planner puro e worker manual de homologação. É proibido substituir esse requisito por cron sintético, callback que retorna `healthy` constante ou um heartbeat gerado a partir de mera consulta SQL.

Em HA, cada componente só possui um `sourceId` válido por tenant: réplicas simultâneas que disputam sequence fazem no máximo uma gravação. Rotação de fonte e promoção de standby exigem protocolo de concessão/fencing e aprovação operacional; o código não promove standby automaticamente. `ready` na prévia de teste não representa GO do ambiente.

## Gates
1. CI Qualidade (TypeScript, segurança, testes unitários, build, Docker).
2. CI SLA MySQL 8.4 isolado para transações, reads e integração E2E.
3. Prova futura com processos reais, emitters autorizados no código do worker, chaves gerenciadas, observabilidade de falha do emissor e homologação do failover.
4. Manter PR Draft: sem merge main, deploy, migrations produtivas, grants, worker, publicação, cron, replay ou alteração de Ocorrência.
