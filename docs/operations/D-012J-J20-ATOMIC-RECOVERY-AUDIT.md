# AXE Dispatch — D-012J J20: transação atômica de quarentena e auditoria

**Estado:** implementação interna **somente para homologação**. Empilhada sobre J19 (#158). Não habilita endpoint, scheduler, replay, grant ou implantação operacional.

## Contrato J20

`createIntegrationRecoveryAuditedMySqlService(db, serverClock).quarantineExpired(input)` concentra numa única transação MySQL:

1. Valida o gate `NODE_ENV=test`, `AXE_RUNTIME_ENV=homologation`, `AXE_INTEGRATION_RECOVERY_J20_ENABLED=true` e confirmação humana reconhecida por chamada **interna**.
2. Bloqueia o usuário em `users`; rejeita inativo/inexistente e refaz a consulta das atribuições ativas no banco.
3. Considera apenas atribuições dinâmicas do perfil `administrador` de escopo `global` ou `organizacao` correspondente ao tenant ativo. Exige `workflow.execute` e `integrations.recover` ativos; nunca trata `*`/perfil legado como autorização. `integrations.recover` **não recebe grant** por esta entrega.
4. Bloqueia por `FOR UPDATE` a linha de outbox com ID **e** organização resolvida. Revalida snapshot, versão, lease vencido, escopo, correlação, motivo e chamado usando J19.
5. Consulta o relógio seguro **depois** dos locks; calcula transição conservadora `leased → dead_letter` (estado externo desconhecido), sem repetir a mensagem.
6. Faz `UPDATE` CAS com versão, tenant, status, worker, token e expiração; `affectedRows != 1` gera conflito e rollback.
7. Insere na mesma transação a auditoria sanitizada `integration.outbox.expired_lease.quarantine`, com IDs, antes/depois, motivo enumerado, chamado e correlação. Não inclui token de lease, referência/payload, segredos, respostas externas ou PII.
8. Confere novamente o gate antes de confirmar. Qualquer erro (inclusive insert da auditoria) gera **rollback conjunto**.

## Evidências de homologação (MySQL 8.4 físico)

O arquivo `server/integrationOutbox.mysql-homologation.ts` inclui mais cinco cenários J20:
- Quarentena e auditoria no mesmo commit, com sanitização.
- Administrador de outra organização e usuário sem permissão são negados sem escrita.
- Falha SQL forçada em auditoria provoca rollback da mudança de estado.
- Duas recuperações concorrentes geram no máximo uma quarentena e um registro de auditoria.
- Gate desligado nega qualquer mutação.

Todos os cenários da suíte J18 continuam exigidos. A CI da branch/PR é a fonte de verdade para resultados, não esta descrição.

## Restrições remanescentes

Esta implementação **não** é uma rota autenticada. Cabe à futura camada HTTP obter `authenticatedActorUserId` da sessão e `resolvedOrganizationId` do escopo já autorizado, e jamais do corpo da requisição. O booleano de aprovação também deverá ser ligado a uma confirmação autenticada e auditável, não a um parâmetro público.

Não há migration nova, grants RBAC, credenciais reais, envio para NEO/Inventário/CRM ou alteração de Ocorrências. O checkpoint da J19 permanece disponível. Reconciliar as linhas paralelas J13 (#145/#146), J16 (#151/#152) e J19 (#157/#158) antes de qualquer merge.

**Critério GO ainda pendente:** endpoint com autenticação forte/organização verificada, aprovação operacional, teste de crash e replicação, revisão de autorização concorrente, rollback/restauração e aceite de segurança. O estado `dead_letter` não é prova de que o sistema externo não realizou a operação.
