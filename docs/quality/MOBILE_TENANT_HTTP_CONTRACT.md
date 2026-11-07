# AXE Despacho — contrato HTTP do seletor de organização Mobile

**Escopo:** testes com o `rootRouter` real e adaptador HTTP tRPC, com interface MySQL e snapshot RBAC *simulados* (sem rede externa, credenciais ou produção).

## Progresso deste ciclo

O teste `server/mobileTenantHttpContract.test.ts` envia requisições GET sintéticas para o roteador efetivamente exposto pela central (`rootRouter` → `typedTenantAwareAppRouter` → `tenantAwareAppRouter`). Exercita `tenant.selection` com SuperJSON:

1. Sessão ausente: HTTP 401 sem consulta à base.
2. Usuário inativo: HTTP 403 sem consulta à base.
3. Duas organizações elegíveis: seleção obrigatória, nenhuma escolhida automaticamente.
4. Cabeçalho `x-organization-id` elegível: organização ativa correta, `requiresSelection=false`.
5. Cabeçalho fora do escopo: não torna o tenant ativo.
6. IDs falsificados, negativos, fracionários, inválidos ou excessivamente grandes: HTTP 400; cabeçalhos brutos com controle ou valores duplicados são rejeitados pelo gate de escopo.
7. Uma organização: auto-seleção.
8. Nenhuma organização: ausência de seleção.
9. Contrato serializado SuperJSON conforme consumo do Mobile.
10. `requireActiveTenant`: rejeita seleção ausente ou não autorizada antes da consulta operacional.

**Correção efetiva de segurança:** `parseTenantHeader()` passou a rejeitar `x-organization-id` recebido como array de valores, em vez de aceitar silenciosamente a primeira organização. Isso evita seleção ambígua quando intermediários encaminham cabeçalhos duplicados.\n\n**Valor técnico:** confirma a rota composta real e a verificação de autorização sem depender apenas de texto dos arquivos. A simulação substitui somente a fonte de organizações/roles, mantendo a lógica de seleção original.

## Limites — não é homologação real

Os testes rodam **dentro do processo de testes**, não consultam um servidor de homologação, MySQL efetivo ou conta de campo. A camada HTTP usa `fetchRequestHandler` para executar o roteador em memória; não valida Express, cookies SameSite, TLS, proxy, credenciais, revogação de JWT nem integração via rede entre Mobile e central.

## Próxima execução com ambiente isolado

**GAP-01 / issue #253:** implementar suíte operacional read-only em URL de homologação autorizada, com credenciais armazenadas apenas no cofre de CI, sem apontar para produção. Validar fluxo `auth.me → tenant.selection → access.me → incidents.list`, 401/403, vínculo de equipe, organização errada, expirado/logout e logs sanitizados. Preservar aceites por pessoa responsável, data e SHA.

Este teste não altera `docs/quality/real-environment-pending-2026-10-23.json`; os gates operacionais continuam bloqueados.
