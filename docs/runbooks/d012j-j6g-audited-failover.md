# D-012J J6G — autorização de dois administradores e auditoria atômica do failover SLA

## Escopo

J6G mantém J6F restrito à troca da **autoridade de evidências de heartbeat**, não dos serviços operacionais. Introduz composição interna `runSlaAuditedFailoverHomologation`, **sem endpoint HTTP/tRPC**, cron ou execução automática.

A chamada exige:
- um **operador já autenticado**, ativo, com papel Super Administrador verificado em `assertSuperAdministrator`, autorizado ao tenant em `listAuthorizedTenants`;
- um **aprovador diferente** do operador, também ativo, Super Administrador e autorizado ao mesmo tenant, consultado novamente no banco;
- aprovação HMAC-SHA256 separada, de validade **máxima 5 minutos**, ligada a organização, componente, operador, aprovador e identificador aleatório único; verificada com chave de 32 bytes ou mais;
- fontes antiga/nova aprovadas **apenas na configuração server-side** e relógio UTC controlado pelo servidor;
- `operatorApproved=true` apenas como registro adicional, **nunca** substituindo autenticação/RBAC/aprovação.

## Configuração de homologação

Somente quando `NODE_ENV != production`, `AXE_RUNTIME_ENV=homologation` e `AXE_SLA_FAILOVER_ENABLED=true`. A implantação NÃO configura automaticamente nenhum destes valores. A composição real também lê `AXE_SLA_FAILOVER_TENANT_ID`, `AXE_SLA_FAILOVER_EXPECTED_SOURCE_SCHEDULER`, `AXE_SLA_FAILOVER_NEXT_SOURCE_SCHEDULER` (e os correspondentes `_ADAPTER`), além de `AXE_SLA_FAILOVER_APPROVAL_SECRET`. Não fornecer segredos em repositório, mensagens, logs ou UI. O aprovador deve emitir o artefato em processo de autorização separado e confiável; **não existe endpoint público que o emita**.

## Auditoria com atomicidade real

No mesmo `db.transaction` que executa `SELECT ... FOR UPDATE` e altera a fonte, grava `audit_logs` como `workflow_sla_heartbeat/manual_failover_fenced`. Registra tenant (`resource_id`), actorUserId, approverUserId e hash SHA-256 das fontes antiga/nova e da aprovação. Não armazena a assinatura HMAC ou a chave e não retorna IDs internos no resultado. Se a gravação da auditoria falhar, **a promoção é revertida**.

A promoção ainda falha fechado se houver heartbeat atual saudável, fonte diferente, relógio inválido ou concorrência; após sucesso o estado é `unhealthy`, sequence=0, e exige novo heartbeat assinado do sucessor. O método J6F legado continua biblioteca de homologação; qualquer novo entrypoint deve utilizar o coordenador J6G auditado, nunca chamar `promote` diretamente.

## Testes e limitações

- unitários: autenticação e dupla autorização antes da consulta, assinaturas alteradas/expiradas, operador/aprovador iguais, tenant cruzado, erro sanitizado;
- MySQL 8.4 descartável: provocação de FK inválida na auditoria provoca rollback da fonte, disputa concorrente entre conexões deixa uma única auditoria, dados confidenciais não aparecem em JSON e outro tenant fica intacto;
- nenhum cadastro de emissor, ativação de scheduler/adapters, deploy, migração de produção, alteração de Ocorrências ou merge na main;
- ativação operacional depende de revisão do fluxo humano de aprovação, registros reais dos processos, credenciais gerenciadas, teste HA real e política de permissões dedicada.
