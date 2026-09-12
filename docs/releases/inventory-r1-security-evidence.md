# Inventário R1 — Evidência de Segurança e Multi-tenant

## Execução

- Head de origem da execução: `85b4be6e06b11cc52908fbeb05fc5588dc7ba471`
- Workflow Qualidade: run `1077` / id `34721110882`
- `security:check`: GREEN
- TypeScript: GREEN

A verificação de segurança registrou: `9 migrações, 22 correções/invariantes preservadas e D-010B/D-010C protegidos`.

## Testes relevantes GREEN

- `server/multiTenantBoundary.test.ts`: 5 testes;
- `server/authorization.test.ts`: 7 testes;
- `server/inventoryArchitectureBoundary.test.ts`: 4 testes;
- `server/inventoryIntegrationContract.test.ts`: 5 testes;
- `server/accessControl.test.ts`: 11 testes;
- `server/accessPolicies.test.ts`: 3 testes.

## Critérios validados

- fronteira arquitetural Inventário × Despacho preservada;
- ausência de dependência direta do banco do Motor pelo Despacho;
- isolamento multi-tenant coberto pela regressão;
- autorização negativa coberta pela suíte;
- contratos críticos mantêm identidade/correlação;
- consumidor de eventos permanece fail-closed para entradas incompatíveis.

## Matriz de permissões proposta

A matriz abaixo é documental e **não aplica grants**:

| Operação | Capacidade mínima proposta | Observação |
| --- | --- | --- |
| Pesquisar/listar ativos | leitura de inventário | sempre no tenant do contexto |
| Consultar detalhe/localização | leitura de inventário | sem acesso direto ao banco |
| Vincular ocorrência/ordem/atividade | escrita de referência autorizada | idempotente e auditável |
| Consumir evento do ativo | identidade técnica do consumidor | envelope versionado e correlação obrigatória |
| Alterar regra crítica da ocorrência | não concedida ao evento do Motor | decisão pertence ao domínio do Despacho |

## Restrições preservadas

- nenhum grant produtivo aplicado;
- nenhuma migration real executada em produção;
- nenhum deploy produtivo executado.

## Resultado

**GREEN — segurança, autorização e isolamento automatizados aprovados para o pacote R1.**