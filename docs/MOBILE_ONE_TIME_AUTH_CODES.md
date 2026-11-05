# AXE Despacho — código de autorização nativa de uso único (etapa P0.2)

Situação: **infraestrutura de backend, não conectada a nenhuma rota nem habilitada em produção**. Dependência anterior: PR #243 (contrato PKCE e vínculo da equipe).

## Entrega incluída

- `server/mobileAuthCodes.ts`: emissão de código aleatório de 256 bits, hash SHA-256 para persistência, TTL máximo de **2 minutos**, validação PKCE S256, client ID, redirect URI, identidade, organização, equipe e dispositivo. Um resgate válido devolve somente um **vínculo candidato** de 15 minutos; ele **não é token** nem concede acesso.
- `server/mobileAuthorizationCodeSchema.ts`: modelo de tabela MySQL com chave primária `code_hash` e índices por hash do dispositivo e prazo de expiração. O identificador de dispositivo é guardado como hash, e nunca se persiste o código legível nem o code verifier.
- `server/mobileCodeMySqlStore.ts`: `put` com unicidade no MySQL, `take` **atômico em transação** com `SELECT ... FOR UPDATE` e gravação de `consumed_at_ms` antes de retornar, e invalidação dos códigos ainda pendentes para um dispositivo. Uma tentativa que chega depois da primeira não retorna o grant.
- `server/mobileAuthCodes.test.ts`: testes de concorrência, uso único, replay, expiração, falha de PKCE, identidade/tenant/equipe/dispositivo cruzado, revogação dos grants pendentes e falha de banco. São testes da lógica por meio de adaptador em memória que reproduz o consumo atômico; **não substituem teste de integração MySQL real**.
- `drizzle.config.ts`: registra o novo schema para permitir geração de migração futura revisada. **Esta PR não cria/aplica automaticamente tabela no banco real.**

## Sequência segura restante

1. Gerar e revisar migração MySQL com `drizzle-kit`, aprovar a criação de tabela, executar em homologação, validar rollback e confirmar unicidade/transações em MySQL 8.4 com duas conexões concorrentes.
2. Criar um endpoint de autorização somente após autenticação da central por canal seguro, consentimento do usuário e autorização atual consultada no banco. **Nunca** aceitar flags `serverAuthorizesTeam` ou `serverAuthorizesOrganization` vindas do JSON do dispositivo.
3. Proteger autorização no browser do sistema e App Link Android verificado. Implementar prova de PKCE, `state` e `issuer`, auditando replay e client/redirect URI permitidos.
4. Implementar armazenamento durável de sessões móveis e revogação de **sessões/tokens**, distincto da revogação de códigos pendentes realizada aqui. O candidato de sessão não é credencial.
5. Proteger refresh token pelo Android Keystore por meio de plugin nativo, com expiração curta do access token, rotação, binding/escopos e auditoria de perda de dispositivo.
6. Integrar as rotas tRPC respeitando tenant/equipe/permissões atuais. Testar Android 14–16 com rede móvel, logout, reautenticação e GPS; passar revisão de segurança antes da liberação.

## Invariantes e bloqueios

- Sem endpoints habilitados: `auth.login` e cookies web não foram alterados.
- Sem segredos, authorization codes, verifier ou refresh tokens em logs, `localStorage` ou banco de texto aberto.
- O adaptador MySQL **falha fechado** se o banco estiver indisponível. O serviço não usa cache em memória para emitir grants em produção.
- Não usar `revokePendingMobileCodesForDevice` como substituto da revogação de sessão operacional.
- A central deve usar rede HTTPS, políticas contra CSRF, rate limit, autenticação/consentimento e tratamento rigoroso de URLs.
- A issue #4 do repositório mobile permanece aberta; a issue #5 (GPS de fundo) continua bloqueada.

## Verificação

```sh
corepack pnpm check
corepack pnpm test
corepack pnpm security:check
corepack pnpm build
```

O fluxo de CI `Qualidade` também inclui Docker e verificação de prontidão. Nenhuma integração à `main` ocorrerá antes de resultados aprovados no mesmo SHA. A entrada em produção dependerá de revisão humana de segurança, homologação com o banco real, integração Android e aprovação explícita.
