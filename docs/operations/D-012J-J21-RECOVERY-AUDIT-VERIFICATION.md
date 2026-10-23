# D-012J J21 — Verificação de evidência de recuperação (somente leitura)

**Escopo:** diagnóstico interno, não exposto em rota ou UI. Empilhado na J20 (#160). Branch pré-produção em Draft.

## Problema abordado

Uma outbox em `dead_letter` com `last_failure_kind=unknown` **não** prova que o destino externo falhou. A transação J20 deve gerar evidência de auditoria congruente com o estado, mas estados antigos podem ter sido colocados em quarentena pela J17 sem a auditoria atômica. O verificador J21 diferencia esses casos sem permitir retry.

## Comportamento

`createIntegrationRecoveryAuditVerifier(db).verify({ organizationId, deliveryId })` retorna somente organização, entrega, status e `permitsReplay:false`.

- `verified`: exatamente um registro de auditoria J20, com ator positivo, organização, versão anterior/atual, sistema, correlação, tentativas, motivo enumerado, chamado, horário e resultado remoto `unknown` correspondentes ao estado da outbox. Campos adicionais inesperados na auditoria geram inconsistência.
- `missing`: outbox de resultado desconhecido sem registro de recuperação correspondente (ex.: quarentena administrativa legada J17).
- `inconsistent`: dados divergentes, auditorias duplicadas, metadados estranhos/sensíveis ou expiração inconsistentes.
- `not_applicable`: entrega ainda não está em quarentena de resultado desconhecido.
- `not_found`: nenhuma entrega no par **ID + organização** resolvido.

Nenhum desses resultados confirma conclusão externa ou autoriza replay. O diagnóstico não devolve payload, referência de payload, lease token, mensagem externa bruta, PII nem JSON do banco.

## Segurança

- Requer `NODE_ENV=test`, `AXE_RUNTIME_ENV=homologation` e `AXE_INTEGRATION_MYSQL_TESTS=true`. Fora desse escopo, falha fechado antes da leitura.
- A organização e o ator devem ser validados por uma futura camada de sessão/serviço, não pelo payload do navegador; a J21 não oferece uma rota HTTP.
- A consulta inicial ao registro da outbox filtra `id` e `organization_id` simultaneamente. Somente depois de localizar a entrega dentro do tenant procura a auditoria pelo `resource_id` e ação esperada.
- O tratamento é estritamente read-only e não executa queries de modificação, workers ou chamadas externas.

## Evidências

Testes unitários em `server/integrationOutboxRecoveryAuditVerifier.test.ts` e quatro cenários adicionais de MySQL 8.4 real em `server/integrationOutbox.mysql-homologation.ts`: audit success, cross-tenant read, falta de auditoria após J17, adulteração e gate fechado.

## Gates

A J21 não concede `integrations.recover`, não aplica migration, não faz merge/deploy e não considera pronta a aplicação de uma operação de recuperação. A homologação da CI é independente de GO produtivo.

Pendências antes de qualquer integração: revisão da cadeia J13/J16/J19 concorrente, autenticação e dupla aprovação, observabilidade de falhas sem vazar dados, rollback/restauração e testes de incidentes externos.
