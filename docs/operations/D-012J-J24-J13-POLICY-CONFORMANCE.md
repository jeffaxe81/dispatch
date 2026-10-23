# AXE Dispatch — D-012J J24: conformidade diferencial das políticas J13

**Estado:** análise executável em branch Draft, derivada da J23 (#165), sem alterar a main.

## Objetivo e escopo

A linha principal de homologação utiliza `shared/integrationResiliencePolicy.ts` (J13 #145, com correção J22). A alternativa J13 #146 define `shared/integrationRetryPolicy.ts` e uma semântica mais detalhada de falhas, atraso e circuit breaker. Essas APIs **não são equivalentes**. A J24 testa as duas lado a lado sem integrá-las automaticamente e sem criar um novo mecanismo de envio.

O arquivo `server/test/fixtures/integrationRetryPolicyJ13Reference.ts` é uma **cópia de referência exclusiva de teste**, extraída do blob `fecc4779574b819296effc829359f1d02fc24a5d` de #146. A aplicação não importa esse código na execução normal.

## Matriz de diferenças

| Critério | J13 #145 → J22 (cadeia principal) | J13 #146 (referência) | Recomendação |
| --- | --- | --- | --- |
| Configuração | `maxAttempts`, `failureThreshold`, `cooldownSeconds` por entrega/adapter | Defaults estáticos NEO: 5/3/60s; Inventário: 5/4/120s; CRM: 6/4/90s, com `baseDelayMs` específico | Persistir política configurada; nunca sobrepor valores por defaults sem migração e aceite |
| Contagem | `nextAttempt` e `consecutiveFailures` distintos | `consecutiveFailures` participa de `maxAttempts` | **Não mapear contadores um-para-um** sem invariantes e testes |
| Retry/backoff | Classificação `retry` e `retryAfterSeconds=0` quando circuito fechado | Backoff exponencial por adapter, teto 60s; `rate_limited` mínimo 30s | Implementar agendamento separado, sem tratar a classificação pura como autorização |
| Falha permanente | API não recebe `failureKind` | `permanent` gera `quarantine` | Manter DLQ pelo `integrationOutboxCas`/regra persistida, mapear classes explicitamente |
| Circuito aberto | Usa timestamp `circuitOpenedAt` e `cooldownSeconds` | `state=open`, `openedAtEpochMs` e `cooldownMs` | Comparar tempos no mesmo relógio, recusar timestamps inválidos |
| Half-open | `half_open`, **`allowAttempt=false`** após J22 | `probe_required`, que **não** é permissão de execução | Exigir lease/fencing persistido, exclusivo e separado por tenant+sistema |
| Falha e núcleo | `coreDisposition=continue` | `coreDisposition=continue` | Preservar operação do Dispatch, sem retransmissão implícita |

### Novas entregas J24

- `shared/integrationPolicyConformance.ts`: diagnóstico imutável `compareJ13PolicyProfiles` com checagem de tenant, versão/sistema e inteiros seguros; informa diferenças de parâmetros e **sempre** `algorithmsEquivalent:false`, `permitsProbe:false`, `permitsExternalCall:false`, `needsDedicatedCircuitLease:true`.
- `server/integrationPolicyConformanceJ24.test.ts`: testes diferenciais de defaults, limites de cooldown (antes/exatamente na virada), half-open, falha permanente, rate-limit, diferenças de contadores, parâmetros, escopo e sanitização para os três adapters.
- Fixture alternativa localizada apenas em `server/test/fixtures/`. Não há import dessa fixture pelo runtime nem API de execução externa.

## Gates de segurança

A J24 não executa chamadas externas, não persiste leases, não cria migração, concede permissões, adiciona endpoint, ativa scheduler ou modifica Ocorrências. A comparação **não** converte `allow`, `retry` ou `probe_required` em autorização de transporte.

**Não fechar unilateralmente #145 ou #146**: parte das diferenças é deliberada, inclusive os parâmetros por tenant vs defaults do laboratório. O fechamento definitivo exige um contrato único de classe de erro, tentativas, identidade de adapter, ledger de idempotência, forma de persistência, reconciliador CAS de circuito por tenant+sistema, revisão de segurança e plano de migração. A cadeia atual J23 mantém o core protegido.

## Evidências

O PR permanece Draft. Observar pipelines Qualidade, SLA MySQL e Integration outbox MySQL no HEAD final, sem considerar GREEN apenas por testes locais ou por execução do commit anterior.
