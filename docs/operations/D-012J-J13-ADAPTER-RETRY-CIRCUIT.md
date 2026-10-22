# D-012J J13 — Retry e circuit breaker por adapter (passivo)

## Objetivo

Definir decisões **puras e determinísticas** para adapters NEO, Inventário/Ativos e CRM. Esta entrega não executa chamada externa, não persiste estado, não agenda jobs, não altera ocorrência e não libera implantação.

## Contrato de execução

- `planIntegrationRetry`: recebe `tenantId`, `system`, contrato v1, classe de falha, contador de falhas consecutivas e relógio explícito; produz apenas uma recomendação (`retry`, `open_circuit`, `quarantine`) e o próximo instante elegível, ou `null`.
- `evaluateIntegrationCircuitGate`: recebe o snapshot do circuito e produz `allow`, `block` ou `probe_required`.
- `probe_required` **não** habilita uma tentativa por si só: requer lease exclusivo/fencing transacional para prevenir sondas concorrentes.
- Cada estado real de integração deverá ser particionado por `tenantId + system` e contrato, com autorização, idempotência, compare-and-swap e auditoria na camada persistente.
- O núcleo do Dispatch mantém `coreDisposition: continue`; degradação dos terceiros não deve derrubar triagem/despacho.
- Não transportar payloads, tokens, mensagens de erro bruto ou PII em resultado de decisão.
- A classe `permanent` e o esgotamento de tentativas levam à quarentena, sem replay automático.

## Padrões **pré-produção** (ajustáveis com homologação)

| Adapter | Tentativas máximas | Abre após | Base de backoff | Cooldown |
|---|---:|---:|---:|---:|
| NEO | 5 | 3 falhas | 1 segundo | 60 segundos |
| Inventário | 5 | 4 falhas | 2 segundos | 120 segundos |
| CRM | 6 | 4 falhas | 1,5 segundo | 90 segundos |

Backoff exponencial limitada a 60 segundos, sem aleatoriedade no planejador puro. A classe `rate_limited` respeita pelo menos 30 segundos, sem sobrescrever uma futura política de `Retry-After` atestada. Os números são defaults de laboratório, **não parâmetros produtivos aprovados**.

## Critérios de testes da J13

1. Backoff determinístico e contadores separados por contexto.
2. Rate limit com espera mínima.
3. Circuito abre após limiar e mantém núcleo disponível.
4. Quarentena para falha permanente ou orçamento esgotado.
5. Circuito aberto bloqueia até cooldown; depois exige prova com fencing.
6. Circuito fechado coerente admite decisão passiva.
7. Fail-closed para tenant/contrato/versão/tempo/contador/estado inválido.
8. Ausência de segredo e payload na resposta.

## Gate ainda pendente

- Storage transacional tenant-scoped com CAS/fencing para circuitos e tentativas.
- Outbox/DLQ e replay auditado das integrações externas.
- Interpretação de `Retry-After` validado; proteção contra thundering herd.
- Evidência de homologação com terceiros, sem escrita direta nos bancos NEO/Inventário/CRM.
- CI GREEN no HEAD, revisão, aprovação expressa para merge/migration/deploy.

**Estado:** contrato isolado para revisão; execução produtiva desativada.
