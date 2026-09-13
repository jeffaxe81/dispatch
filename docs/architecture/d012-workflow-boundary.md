# Fronteira Arquitetural D-012 — Workflow / Automação Operacional

## Estado atual

O AXE Dispatch já possui um **workflow simulado legado** implementado principalmente em `server/db.ts`, com definições versionadas, execuções persistidas, retries, dead-letter, auditoria e superfícies de UI. A tela de execuções o identifica como **SIMULAÇÃO / MOCK**, e os testes atuais comprovam `externalRequests: 0` e `simulationOnly: true`.

A D-012A não substitui, migra nem ativa esse runtime. Ela cria apenas uma fronteira de **contrato versionado** para que a evolução futura reutilize a base existente sem criar um segundo motor concorrente.

## Ownership da D-012A

A D-012A é proprietária somente de contratos compartilhados e validações puras da fronteira de Workflow. Ela define versão do envelope, allowlist inicial de eventos internos, `tenant`, `correlationId`, `eventId` e a chave determinística de **idempotência**.

O `tenant` recebido no envelope nunca é autorização por si só. O processamento deve comparar o envelope com um contexto confiável e operar em modo **fail-closed** quando houver versão inválida, formato inválido ou divergência de tenant.

## Limites

Nesta etapa não existe integração runtime do novo contrato com o executor simulado, tRPC, banco ou UI. Também não existe consumo de eventos externos de D-008 ou Inventário.

A D-012A opera **sem migration**, **sem deploy** e **sem grant**. Não altera tabelas, procedures, páginas, estados de Ocorrência ou comportamento operacional existente.

## Capacidades proibidas na D-012A

A D-012A permanece **sem chamada HTTP**, **sem execução de processo** e **sem alteração de estado de ocorrência**. Também permanece sem escrita de banco, sem credenciais externas e sem ativação do executor legado fora do modo simulado.

## Evolução controlada

- D-012B conecta o modelo de definição/versionamento aprovado à evolução do domínio existente.
- D-012C evolui instâncias e máquina de estados.
- D-012E aplica a resolução completa de organização ativa, RBAC e isolamento multi-tenant.
- D-012F liga produtores/eventos autorizados e a deduplicação persistente.

## Rollback

O rollback da D-012A remove somente os novos contratos, helpers puros, testes e esta documentação. Como não há migration, runtime wiring ou alteração de dados, não existe rollback de banco nesta microentrega.
