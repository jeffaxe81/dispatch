# D-012J J31 — intenção persistida one-shot de execução de probe

## Objetivo

Fechar a lacuna entre o lease fenced J27/J30 e uma futura execução real de probe, sem executar qualquer chamada externa nesta entrega.

## Regra central

Um lease half-open ativo **não** é autorização de probe. A J31 introduz uma intenção persistida separada, vinculada a tenant+sistema+versão+lease.

1. `issue` grava um token opaco de execução e expiração menor ou igual ao lease. Continua `permitsProbe:false`.
2. `consume` usa CAS e fencing para marcar a intenção como consumida. Somente o vencedor recebe `permitsProbe:true`.
3. Crash após consumo perde a oportunidade, mas não permite segundo probe: segurança fail-closed.
4. O token não entra em auditoria, logs, UI ou payload externo.
5. `permitsExternalCall:false` e `permitsAutomaticReplay:false` permanecem; a futura infraestrutura de probe deverá aceitar apenas o grant one-shot e ainda não existe nesta entrega.

## Persistência proposta

Migration aditiva `0021_d012j_probe_execution_intent.sql` sobre `integration_circuit_state`:
- `probe_execution_token varchar(160)`;
- `probe_execution_expires_at_ms bigint unsigned`;
- `probe_execution_consumed_at_ms bigint unsigned`.

Nenhuma migration real será aplicada sem aprovação explícita.

## TDD / gates

- RED do contrato puro antes da implementação;
- integração ao coordinator/storage somente após RED;
- prova concorrente em MySQL 8.4 descartável: dois consumidores, exatamente um vencedor;
- Qualidade, SLA MySQL e Integration outbox MySQL no mesmo HEAD;
- PR Draft empilhado sobre J30.

## Fora de escopo

- chamada NEO/CRM/Inventário;
- scheduler/worker;
- replay automático;
- endpoint/tRPC/UI;
- grants;
- deploy;
- migration produtiva;
- merge da pilha em main.
