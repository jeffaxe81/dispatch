# AXE Despacho — proteção CSRF para mutações tRPC (05/11/2026)

## Objetivo

Bloquear alterações disparadas por páginas de outras origens contra a API tRPC que utiliza cookies de sessão, sem modificar o modelo de autenticação, permissões ou banco de dados. Implementação somente em branch de revisão, **sem publicação em produção**.

## Política

O middleware `requireSameOriginTrpcMutation` é aplicado somente a `/api/trpc`, depois das rotas externas específicas e antes do handler do tRPC. Para métodos `POST`, `PUT`, `PATCH` e `DELETE`:

- Se `Sec-Fetch-Site` existir, **somente** `same-origin` é aceito; `cross-site`, `same-site`, `none` e valores inesperados recebem HTTP 403.
- Se o cabeçalho não existir, exige-se `Origin` válido que corresponda **exatamente** ao protocolo, domínio e porta observados em `Host`. Origens `null`, malformadas, com esquema incompatível ou porta diferente são recusadas.
- Se `Sec-Fetch-Site` e `Origin` estiverem ausentes, uma mutação com `Cookie` é recusada. Requisições sem cookie e sem metadados continuam possíveis para clientes não navegadores; elas dependem integralmente da autenticação e autorização já exigidas pela própria API.
- `GET`, `HEAD` e `OPTIONS` não são alterados. Rejeições retornam 403 com `Cache-Control: no-store`.

O `Sec-Fetch-Site: same-origin` é preferido ao `Origin` nas solicitações com os dois cabeçalhos, pois o proxy de desenvolvimento pode reescrever o `Host` upstream; o browser gera este cabeçalho e JavaScript de outra origem não pode alterá-lo. **Não confiar nesse mecanismo para autenticar scripts/nativos ou clientes maliciosos que controlam cabeçalhos HTTP**.

## Testes e homologação

A suíte `server/_core/trpcCsrf.test.ts` cobre: requisições legítimas e falsificadas, origem cruzada, subdomínios, alteração de protocolo/porta, cabeçalhos ausentes, clientes sem cookie e passagem ao middleware do tRPC.

Antes de integração, exigir CI verde para `pnpm check`, `pnpm test` e `pnpm build`, validação das chamadas tRPC reais, login/logout, uso com proxy de desenvolvimento, e teste de navegadores legados sem Fetch Metadata. **Atenção:** requisições com cookie sem `Origin`/`Sec-Fetch-Site` deixarão de funcionar intencionalmente; homologar integrações necessárias antes de qualquer merge.

## Pendências independentes

- Revisar `SameSite=None` do cookie em HTTPS e seus usos legítimos em aplicações incorporadas; não alterar automaticamente sem análise de compatibilidade.
- A atual assinatura JWT de até 8 horas não sofre invalidação centralizada apenas com o `auth.logout`; projetar revogação persistida e rotação antes da liberação operacional.
- Autenticação nativa Android/iOS e GPS operacional continuam bloqueados.
- PRs #236/#237 (RBAC e isolamento tenant-aware) permanecem independentes, também sem merge nesta entrega.

**Status: PR draft, homologação pendente, produção bloqueada.**
