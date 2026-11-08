# AXE Despacho — isolamento e minimização da auditoria por ocorrência

**Data da revisão:** 2026-11-07. **Referência:** backlog R013 (P0), PR Draft #237, issue #259.
**Ambiente:** validação sintética/CI; sem acesso à base operacional ou implantação em produção. Estado de release **NO-GO**.

## Problema encontrado

O modelo de auditoria operacional por tenant já limitava a pesquisa paginada a registros da organização autorizada e ao escopo da equipe/unidade. Porém o endpoint `incidents.audit` conferia apenas a permissão `audit.view` e a existência da ocorrência no tenant; **não conferia o escopo da atribuição de auditoria para a equipe/unidade da ocorrência antes de buscar os logs**. Além disso, a consulta individual devolvia ao navegador identificadores do ator e instantâneos de dados que não são necessários à interface.

## Correção

1. Reutilizar a **mesma consulta de concessões `audit.view`/`*`** (role_permissions, permissions ativas, vínculo ativo, não expirado) para a listagem paginada e o detalhe de ocorrência. Uma concessão de outro tipo não permite visualizar auditoria.
2. Sem papel dinâmico e sem histórico QA, preservar a política legada existente, porém limitada à ocorrência dentro do tenant autenticado. Um perfil de homologação expirado/desativado **nunca** equivale a legado sem papéis.
3. Se `audit.view` for de organização ou global canônico: consultar a ocorrência no tenant selecionado, inclusive se ainda não houver equipe atribuída.
4. Se o escopo for de equipe/unidade: exigir equipe atribuída, confirmar a organização da equipe e testar a concessão específica; registros de outras equipes, unidades ou tenants são recusados com `FORBIDDEN`.
5. Antes de chamar `getIncidentAudit`, aplicar `assertTenantIncidentAuditAccess` e `assertCanReadIncident`. Ocorrência ausente no tenant responde `NOT_FOUND` sem consultar auditoria.
6. Responder a consulta individual com apenas metadados permitidos: `actorUserId=null`, `actorName="Usuário auditado"` quando existente e objetos `beforeData/afterData` restritos à allowlist vigente. O registro original no banco **não é modificado**.

## Provas automáticas desta rodada

- `server/tenantAuditReadModel.test.ts`: casos de perfil sem concessão, outra equipe, outra organização, unidade, ocorrência sem equipe, grants amplos e redigibilidade.
- `server/tenantIncidentAudit.router.test.ts`: chama o router tRPC com colaboradores simulados; comprova que erros de permissão/tenant/equipe impedem `getIncidentAudit` e que a resposta autorizada tem PII mascarada.
- CI padrão: TypeScript, segurança, Vitest, build, Docker, MySQL 8.4, GIS e NEO. Resultados e SHA devem constar na PR.

## Limitações e gates

- Os testes do novo router usam dados e funções de acesso simulados; não são homologação com banco real, dispositivos físicos ou organizações de produção.
- A autenticação, filtros SQL de `listTenantOperationLogs` e sua contagem/paginação permanecem como estavam.
- A PR Draft #237 contém propostas adicionais e não será mesclada integralmente sem análise de compatibilidade; correção de cookies `SameSite` (#239) continua bloqueada até a prova de integração NEO/iframe.
- Requer evidência humana dos gates reais REAL-01/02/03 e revisão independente F04/F05/F06 antes de qualquer GO.
