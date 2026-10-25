# AXE Dispatch — D-012J J22: consolidação segura de J13/J16/J19

**Objetivo:** levar a correção do circuito `half_open` da linha paralela J19 #157 para a cadeia principal de homologação J21 #163, **sem reescrever, fechar ou mesclar PRs existentes**.

## Matriz de reconciliação

| Tema | Trilhas simultâneas | Resolução nesta branch | Situação para merge |
| --- | --- | --- | --- |
| J13 circuit breaker | #145 `integrationResiliencePolicy`; #146 `integrationRetryPolicy` | Preservar a API já herdada de #145 para não romper J14–J21. Portar o *fail-closed* de #157: `half_open` retorna `allowAttempt:false` até que exista lease persistido e exclusivo. A API alternativa #146 continua como referência de especificação. | Requer revisão de semântica, testes e escolha única de contratos |
| J16 outbox CAS | #151 contém **apenas testes** de lifecycle/coordenador ainda não presentes nessa linha; #152 fornece implementação persistente e CAS | Manter #152 na cadeia, comprovada pelo MySQL 8.4 em J18/J20/J21. Não integrar testes incompatíveis do #151 como se fossem código funcional. | Consolidar requisitos cobertos pelas duas especificações antes de fechar o duplicado |
| J19 half-open | #157 corrige #145 em branch baseada em J18, mas não está presente na cadeia #158→#163 | Portar comportamento e casos de regressão para J22 sobre J21; não alterar branch alheia | Testar e revisar a equivalência com #157 |
| J19 autorização | #158 cria pré-autorização RBAC por tenant; J20/J21 dependem dela | Preservar a cadeia #158→#160→#163, mantendo `integrations.recover` sem concessão automática e auditoria J20 atômica | Requer homologação e aceite de segurança |

## Contrato de segurança da J22

- `half_open` significa apenas **janela de prova elegível**, nunca permissão para envio.
- Não chamar um adaptador externo até persistir lease/CAS, resolver tenant/sistema, verificar política e obter auditoria/autorização necessária.
- A chamada repetida da função pura não fabrica um token de lease nem concede autorização.
- Revalidar `system` via `assertIntegrationContractCompatibility` versão 1 e rejeitar contadores acima de `Number.MAX_SAFE_INTEGER`.
- `open_circuit` durante cooldown e `exhausted` continuam bloqueados.
- Nenhum endpoint, scheduler, replay, grant, atualização da tabela ou alteração de Ocorrências é ligado nesta branch.

## Evidências

Testes modificados em `server/integrationResiliencePolicy.test.ts`, incluindo:
- limiar de cooldown 29,999 / 30,000 segundos para todos os três adapters;
- repetição de avaliação sem autorização implícita;
- rejeição de sistemas desconhecidos e inteiros inseguros;
- testes J13 de retry, exaustão e sanitização já existentes.

A CI de Qualidade, SLA MySQL e Integrações MySQL é obrigatória no HEAD antes de considerar a J22 GREEN.

## Integração e risco residual

**Não fazer merge automático.** J13 #145 e #146 ainda devem ser reconciliados conceitualmente, e J16 #151 e #152 não são implementações equivalentes. `allowAttempt:true` nos estados normais `allow`/`retry` é apenas uma decisão de política pura: **não** deve ser confundida com autorização de transporte ou concessão de lease. A autorização efetiva continua bloqueada até que o chamador persista o CAS e obtenha uma confirmação inequívoca. Validação física e operacional de probes após fencing permanece um gate separado.
