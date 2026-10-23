# AXE Dispatch — D-012J J19: pré-autorização administrativa e evidência sanitizada

**Status:** pré-validação isolada, sem endpoint, grant ou escrita. Branch empilhada sobre J18 (#155).

## Objetivo

Preparar o contrato de autorização de recuperação de lease expirado, que poderá anteceder uma transação única de **quarentena + auditoria** em entrega futura. A avaliação é pura e **nunca executa** a recuperação.

## Requisitos de pré-autorização (fail-closed)

1. Usuário ativo, identificador de ator positivo, vínculo de administrador **global** ou de organização específica. Administradores com escopo de unidade/equipe, supervisores, operadores e agentes não são elegíveis.
2. Organização ativa **resolvida pelo servidor** e igual à organização do registro carregado por consulta tenant-scoped. Até um administrador global deve indicar um contexto organizacional válido.
3. Permissões dinâmicas explícitas **`workflow.execute` E `integrations.recover`**. Não há herança de `*`, fallback de administrador legado, grant automático ou permissão nova concedida por esta entrega. `integrations.recover` é um contrato futuro e permanece indisponível até aprovação e cadastro deliberados.
4. Entrega em `leased`, lease já expirado, versão do snapshot igual à esperada e relógio seguro do servidor.
5. Motivo enumerado (`delivery_outcome_unknown`, `lease_expired_after_disconnect` ou `operator_reconciliation`) e referência estruturada `INC-`, `CHG-` ou `OPS-` numérica. Texto livre não é preservado na evidência para reduzir riscos de PII/segredos.
6. Correlação segura e sanitização rigorosa: a evidência contém somente ator, tenant, entrega, versão, sistema, código de motivo, referência do chamado e horário. **Não** contém token de lease, payload/referência de payload, erro bruto ou credencial.

## Saída e garantias

`prepareIntegrationLeaseRecoveryApproval` retorna `decision: eligible_for_audited_transaction`, `executionAuthorized: false` e `requiresTransactionalAudit: true`.

Esta saída é **somente prévia**, não uma autorização persistida. Não é prova de que houve auditoria nem que o estado de integração foi alterado.

## Gates necessários para escrita real

- Autenticação forte e reconsulta de RBAC, organização ativa, lease, versão e idempotência dentro da mesma operação transacional.
- Aprovação expressa do novo código de permissão no catálogo RBAC, sem atribuição implícita.
- Persistência do registro de auditoria **na mesma transação** que executa a quarentena, com rollback total quando a auditoria falhar.
- Prova física MySQL 8.4 de concorrência entre recuperador e worker, auditoria, rollback, replay negado e isolamento tenant A/B.
- Revisão de processo operacional e suporte a ação humana, sem reenvio da mensagem ao provedor antes de reconciliação do resultado externo.
- Revisão/consolidação dos PRs concorrentes J13 #145/#146 e J16 #151/#152 antes de merge em `main`.
- Nenhuma mutation, migration produtiva, worker automático, grant, endpoint externo ou deploy habilitado pela J19.

A J18 testou fisicamente a camada de outbox; a J19 testa apenas este contrato puro de autorização.
