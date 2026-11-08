# AXE Despacho — proteção contra concessões globais malformadas

**Data:** 2026-11-07. **Código em revisão:** branch `security/refine-canonical-global-scope-20261107`. Origem do diagnóstico: PR antiga #237, cuja integração direta não seria segura por conflitos de base e pela exigência de **organização + equipe** no perfil QA `homolog_agente_campo`.

## Mudança implementada

- Um perfil com `defaultScope=global` **somente** é canônico quando `organizationId`, `organizationalUnitId` e `teamId` estão todos ausentes/`null`.
- A API recusa novas atribuições globais que tentem preencher qualquer um desses campos.
- O cálculo de permissões efetivas remove permissões originadas de vínculos globais malformados **mas mantém o vínculo no snapshot** para não restaurar os poderes de `operationalRole` legado.
- Autorizações de Super Administrador, Administrador para organização, seleção livre de tenant e acesso à equipe aplicam o mesmo critério.
- A visibilidade de auditoria não transforma uma concessão global malformada em leitura total do tenant.
- O vínculo de homologação válido por **equipe + organização** permanece permitido. A mudança de escopo completo proposta na PR #237 não foi aplicada sem avaliação de compatibilidade.

## Testes

- `server/accessPolicies.test.ts`: casos válidos e inválidos, limites, filtro de permissão dinâmica e compatibilidade QA.
- `server/accessControl.test.ts`: supervisor, administrador e Super Administrador, escopo por equipe e tenant ativo.
- `server/tenantAuditReadModel.test.ts`: concessões globais com campos preenchidos não expandem auditoria.
- CI exigida no SHA final: segurança, TypeScript, Vitest, MySQL 8.4, GIS/NEO, Docker.

## Pendências

A correção não substitui uma revisão independente de todas as rotas que dependem de `assertPermission`, nem libera integração operacional, servidor de homologação real, Android nativo, F04/F05/F06 ou produção. O tratamento completo de auditoria por ocorrência da antiga PR #237 permanece separado. Não foram executados testes em produção nem concedidos privilégios em bases reais.
