# AXE Dispatch — D-012J J25: contrato unificado de falhas, retry e cooldown

**Escopo:** contrato puro + homologação em MySQL 8.4, empilhado sobre a J24 (#166). Sem transporte externo, scheduler, autorização de replay, concessões de RBAC, migração ou alteração de produção.

## Contrato J25

`planIntegrationFailureResolution(...)` recebe **uma leitura confiável da outbox por tenant e versão** e informações verificadas do provedor/circuito. Retorna uma decisão sanitizada e um comando de transição compatível com o CAS J16/J23. Este módulo não altera estado, não acessa a rede e não lê dados de usuários ou de outros tenants.

- Classes **canônicas existentes no schema**: `timeout`, `unavailable`, `rate_limited`, `contract_mismatch`, `authorization`, `unknown`. Não inventa `permanent` como enum do banco. Falha permanente do contrato alternativo J13 #146 precisa ser traduzida pelo adaptador confiável para uma classe canônica comprovada (por exemplo, `contract_mismatch` quando o contrato realmente não corresponde) ou bloqueada como `unknown`.
- `remoteAcceptance = outcome_unknown` resulta **sempre em quarentena** com `lastFailureKind=unknown`, inclusive para timeout e indisponibilidade; é proibido supor que o destinatário não processou a mensagem.
- Apenas `confirmed_not_accepted` pode gerar retry, e somente se o erro for temporário, houver tentativas disponíveis, não tiver atingido o limiar de falhas e o circuito estiver **closed**.
- `contract_mismatch`, `authorization` e `unknown` geram `dead_letter` sem retry. Tentativas esgotadas também encerram o fluxo.
- Circuito `open` ou `half_open` gera quarentena conservadora na J25: a plataforma ainda não tem lease/semáforo exclusivo de **circuit breaker por tenant e sistema**. J22 impede probe automático; essa proteção não pode ser contornada por J25.
- Atraso exponencial: `min(60.000 ms, baseDelayMs * 2^(consecutiveFailures-1))`; `rate_limited` exige piso de 30.000 ms. O `baseDelayMs` precisa vir de **política persistida confiável** do tenant/adapter; não é substituído por defaults estáticos da J13 #146.
- O atraso planejado não é uma entrega: `permitsExternalCall=false`, `permitsProbe=false`, `permitsAutomaticReplay=false`, `requiresTenantScopedCas=true`, `requiresSeparateCircuitLease=true`, `coreDisposition=continue` são invariantes de todas as decisões.

## Integração com CAS real

O resultado `transition` fornece os parâmetros `retry` ou `dead_letter` que um chamador interno pode passar a `createIntegrationOutboxCasCoordinator.resolve` da J23. A J23 reconfirma trabalhador, token de lease, versão, expiração e escopo, antes de chamar o CAS persistido da J16. A transição **não carrega token, payload, credenciais ou resposta bruta**. Jamais aceitar evidência remota, política ou tenant enviada diretamente pelo navegador.

### Limitação explícita

O campo `consecutiveFailures` não está materializado na tabela `integration_delivery_outbox`. A J25 **não calcula esse valor artificialmente a partir de `attempts`**. O chamador futuro deve obtê-lo do estado real e confiável do circuito; caso indisponível, deve falhar fechado e não executar um retry. A J25 não cria nem atribui estado de circuit breaker persistido. Esta é uma condição pendente para GO.

## Evidências e homologação

- `server/integrationFailurePolicy.test.ts`: 13 verificações focadas de classificação, tentativa máxima, relógio, lease, tenant, versão, agendamento, circuito, contrato, sanitização e falha incerta.
- `server/integrationOutbox.mysql-homologation.ts`: 3 ensaios físicos adicionais: (1) rate limit definitivamente não aceito agendado com piso de 30s, sem claim antecipado; (2) timeout incerto levado à DLQ sem replay automático; (3) versão CAS obsoleta rejeitada após uma transição real.
- Regressão completa das suítes Qualidade, SLA MySQL e Integration outbox MySQL no HEAD, conforme evidência anexada à PR.

## Não autorizado

Sem merge automático na `main`, sem deploy, sem mudança da política de J13 em runtime, sem integração com NEO/Inventário/CRM, sem chamada HTTP/sip, sem endpoint, sem scheduler/worker, sem grant e sem replay. A J25 é homologação controlada e ainda exige revisão de autorização, schema de circuit lease confiável, auditabilidade e aceite operacional.
