# AXE Dispatch — D-012J J17: quarentena de leases expirados

**Estado:** módulo administrativo não exposto, sem execução automática. Continuação empilhada sobre J16 (#152).

## Motivação

Se um worker perde o heartbeat após tentar enviar uma mensagem a NEO, Inventário ou CRM, não há confirmação de que a operação externa não tenha ocorrido. Um replay automático de uma entrega `leased` expirada poderia duplicar uma ação remota. Por isso a J17 adota **quarentena conservadora**, em vez de reenvio.

## Contrato

- `buildExpiredIntegrationLeaseQuarantine(current, nowEpochMs)`: função pura, exige snapshot válido da J16, status `leased`, lease expirado e relógio seguro. Produz `dead_letter` com `lastFailureKind: unknown`, sem aumentar tentativas nem carregar payload.
- `createExpiredIntegrationLeaseRecoveryStorage(db).quarantineExpired(...)`: update único com cláusulas obrigatórias de organização, entrega, versão, status, worker, token, timestamp exato do lease e `lease_expires_at_ms <= nowEpochMs`; guarda também sistema, versão do contrato, chave idempotente e correlação.
- `affectedRows === 0`: conflito ou outra atualização venceu, retorna `false`. Qualquer valor diferente de 1 para atualização considerada bem-sucedida falha fechado.
- Estados `pending`, `delivered` ou `dead_letter` não entram na recuperação.
- Lease ainda vigente jamais é recuperado, inclusive na cláusula SQL.
- Sem replay, scheduler, chamada externa, endpoint, permissão ou migration adicional.

## Pré-condições de ativação (não implementadas na J17)

1. Operação administrativa autorizada explicitamente, com tenant resolvido no servidor e checagem de RBAC.
2. Registro de auditoria transacional de ator, justificativa e correlação antes de declarar a recuperação como concluída.
3. Instante de comparação derivado de relógio confiável; política de sincronização/clock skew definida e testada.
4. Migração J15 aplicada apenas em ambiente de homologação isolado.
5. Testes reais de disputa entre worker e recuperador com MySQL 8.4, incluindo crash após envio, CAS obsoleto, expiração no limiar e tenant A/B.
6. Investigação/reconciliação operacional de resultados externos antes de qualquer tentativa de replay manual.

## Segurança e cautela operacional

`dead_letter` com `unknown` **não confirma que a entrega falhou externamente**: significa que a posse do lease expirou e o resultado é desconhecido. Não enviar novamente sem verificar idempotência do destino e estado remoto.

A comparação em JavaScript e no SQL utiliza `nowEpochMs` fornecido pelo serviço. Não é aceitável receber este valor diretamente de um cliente ou dispositivo de campo.

## Evidências

Testes de unidade e SQL fake em `server/integrationOutboxExpiredLease.test.ts`: expiração exata, bloqueio de lease vigente, estados inválidos, tenant/version fencing, zero linhas, múltiplas linhas e ausência de conteúdo sensível. A suíte de CI valida código; não substitui homologação da nova tabela em MySQL real.

**Gates:** PR Draft, sem merge, deploy, migration operacional ou concessão de permissão.
