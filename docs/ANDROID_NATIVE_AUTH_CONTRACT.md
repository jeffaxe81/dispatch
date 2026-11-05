# AXE Despacho — contrato de autenticação nativa Android (preparação P0)

Status: **somente biblioteca de validação e testes, sem endpoints ativos**. Data: 05/11/2026.

## Objetivo

Preparar a integração oficial do APK `jeffaxe81/axe-despacho-mobile` com a central `jeffaxe81/dispatch`, preservando a segurança do cookie HttpOnly da PWA existente e mantendo todas as operações nativas bloqueadas até homologação. O backend **não** emite códigos, access tokens, refresh tokens ou sessões móveis nesta entrega.

## Seis disciplinas de revisão

| Especialidade | Contrato / evidência | Pendência de implementação |
| --- | --- | --- |
| Arquitetura | `server/mobileAuthContract.ts` define protocolo v1 e a separação da sessão web | Servidor de autorização/armazenamento persistente |
| Backend | Escopo de identidade/tenant/equipe/dispositivo previsto em `validateNativeSessionScope` | Conferência com permissões reais a cada requisição; migrações e índices |
| Segurança | PKCE S256 RFC7636; anti-CSRF `state`, emissor de callback RFC9207, URI HTTPS exata | Threat model formal; rotação/revogação durable; auditoria externa |
| Android | HTTPS App Link verificado como URI de retorno; sem senha na WebView | Navegador do sistema, prova de associação ao app, Keystore e ciclo de vida |
| UX de campo | Não ativar botões nem GPS se o dispositivo/escopo não estiver autorizado | Expiração, reautenticação e indicadores de sessão no cliente |
| QA | Testes de downgrade, redirecionamento, issuer mix-up, tenant cruzado, revogação e expiração | E2E real e Android 14–16 com tela bloqueada/rede instável |

## Política proposta do fluxo nativo

1. O dispositivo abre o navegador do sistema usando Authorization Code + PKCE `S256`, com `state` forte, URI HTTPS por App Link verificado e `issuer` esperado.
2. O backend valida o cliente registrado e a correspondência exata do redirect URI. **Nenhum valor armazenado em JavaScript deve ser usado como refresh token**.
3. Após retorno de autorização, o cliente rejeita qualquer host/path, estado, código, fragmento, duplicidade de parâmetros ou issuer inesperado. O código de autorização não concede acesso por si.
4. O backend troca códigos somente uma vez, valida o verificador PKCE e registra em **armazenamento persistente** vínculo com dispositivo, identidade, tenant, equipe, expiração e revogação.
5. Credenciais de longa duração e refresh token, se adotados, ficam na interface nativa protegida pelo Keystore, nunca na WebView; access tokens devem ser curtos e ter `aud` restrito e `scope` mínimo.
6. Toda consulta ou mutação em `incidents` e `teams.recordLocation` revalida usuário ativo, organização autorizada, equipe, dispositivo, sessão e permissões no backend. Respostas antigas não podem sobrescrever as atuais.
7. Logout, alteração de equipe, remoção do dispositivo, expiração ou revogação devem invalidar o servidor de forma durável, inclusive em instâncias múltiplas. **Não reutilizar o JWT web existente** como token móvel.
8. Rastreio GPS operacional continua desativado até homologação independente da issue móvel #5.

## Restrições para impedir implantação prematura

- **Não ativar** `config.enabled` em nenhuma rota sem revisão, segredo servidor e persistência de sessões.
- A função `validateMobileAuthorizationRequest` verifica o envelope do futuro pedido, mas ainda **não prova posse** do App Link/Keystore e não emite nada.
- `validateMobileCallback` verifica o formato e vínculo do callback; não realiza troca de token e não substitui o navegador do sistema.
- `validateNativeSessionScope` é uma pré-condição pura: flags de autorização precisam vir de verificações atuais no banco, não da requisição do aparelho. Ela ainda **não está vinculada** às rotas tRPC.
- O código não altera `server/localAuth.ts`, `server/_core/context.ts`, `server/routers.ts`, cookies ou schema do banco, preservando compatibilidade com as PRs de segurança abertas #238 (CSRF), #239 (cookies) e #242 (revogação de JWT).
- Antes de produção, executar testes instrumentados em Android 14–16, testes de recuperação, rotatividade de chaves, perda de aparelho, rede intermitente, device binding, proteção contra replay, LGPD e pentest.

## Testes

Arquivo: `server/mobileAuthContract.test.ts` (Vitest). Executar `pnpm check`, `pnpm test`, `pnpm security:check`, `pnpm build` e aguardar o workflow **Qualidade** em verde no commit exato do PR.

**Critério de aceite deste incremento:** biblioteca e testes integrados à branch principal sem habilitar login/GPS móvel. **Critério de aceite do produto:** ainda pendente.
