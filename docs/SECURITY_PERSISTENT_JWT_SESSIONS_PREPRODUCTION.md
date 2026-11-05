# AXE Despacho — revogação persistente de JWT (pré-produção)

**Data:** 05/11/2026  
**Escopo:** backend `jeffaxe81/dispatch`; issue #240.  
**Condição:** branch e PR draft, sem migração executada e sem deploy.

## Comportamento proposto

- JWT local mantém assinatura HS256, `issuer` e `audience` atuais, com validade máxima de 8 horas. Cada login recebe `jti` novo de 256 bits.
- O token só é entregue após inclusão de um **hash SHA-256 do jti** na tabela MySQL `local_auth_sessions`. Nunca se persiste JWT, token completo, senha ou jti em claro.
- Toda requisição autenticada verifica: assinatura JWT, `jti` canônico, identidade do usuário, vínculo do hash e expiração na tabela, além de `revoked_at IS NULL`. Falha de armazenamento impede autenticação (*fail closed*).
- O logout revoga o registro **antes** de limpar o cookie e devolver `success: true`. Falha de banco não confirma logout. Um logout repetido ou sem cookie válido não recria a sessão.
- Alterações de senha/credenciais, papel/equipe, vínculos de papel, bloqueio e configurações sensíveis de acesso revogam sessões do usuário dentro da **mesma transação** da atualização.
- Registros podem ser expurgados apenas **após a expiração**. A consulta à base é obrigatória em cada autenticação; não utilizar cache de sessão que possa aceitar uma revogação antiga.

## Implantação controlada (somente futuro, mediante autorização)

1. Backup e validação de restore no laboratório; revisar o SQL `drizzle/0024_local_auth_session_revocation.sql`, o journal e o schema `drizzle/localAuthSessionsSchema.ts`.
2. Aplicar migração primeiro no **MySQL de homologação**, verificar índices, chave estrangeira, sessões concorrentes e uso por múltiplas réplicas.
3. Implantar código no laboratório. JWTs antigos sem `jti` deixam de autenticar: planejar re-login controlado, comunicação com usuários e rollback. **Nunca adotar transição que aceite tokens legados indefinidamente.**
4. Testar login, logout, replay do mesmo JWT após logout, troca de senha, desativação, mudança de equipe, falha MySQL, expiração, duas instâncias concorrentes e tentativas em outro tenant.
5. Confirmar limites de latência e carga (uma leitura por requisição autenticada), proteção contra corrida de login simultâneo com troca de credenciais e política de expurgo. Registrar auditoria sem tokens.
6. Rever controle transacional do despacho para impedir ação previamente autorizada que seja concluída após revogação concorrente; isso exige teste adicional com banco real.
7. Somente depois, revisar PRs de CSRF (#238), cookies (#239), escopo/RBAC (#236/#237) e o aplicativo Android. Não considerar estes PRs automaticamente compatíveis.

## Testes disponíveis na branch

- `server/localAuth.test.ts`: `jti` aleatório, assinatura, recusa por falha da persistência e usuário inválido.
- `server/localAuthSessions.test.ts`: hash, identidade, prazo e revogação.
- Pipeline geral: `pnpm check`, `pnpm test`, `pnpm build`. Verificações com MySQL real ainda devem ser homologadas e documentadas.

## Limites explícitos

A implementação **não** cria autenticação Android/iOS nativa, nem envio de GPS operacional. Não há alterações de produção, grants ou migrações aplicadas. A revogação é por sessão no logout e por usuário em alterações sensíveis; revogação administrativa manual e visualização de dispositivos ativos são melhorias posteriores. Corridas entre autenticação previamente validada e revogação exigem testes e podem demandar controle adicional no limite da mutação.

**Produção bloqueada até autorização explícita.**
