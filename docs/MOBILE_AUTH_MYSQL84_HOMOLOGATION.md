# AXE Despacho — migração e homologação MySQL 8.4 da autenticação móvel

**Entrega:** estrutura de banco e teste automatizado em MySQL isolado. **Pré-produção**, sem habilitar login Android, tokens operacionais ou GPS. Continuação das PRs #243, #244, #245 e #246.

## Quatro frentes técnicas

| Frente | Mudança comprovável | Limite |
| --- | --- | --- |
| Banco de dados | `drizzle/0025_mobile_auth_registry.sql` cria `mobile_registered_devices`, `mobile_authorization_codes` e `mobile_sessions`, com chaves e índices equivalentes aos schemas Drizzle; registrada em `drizzle/meta/_journal.json` | Migração não executada em qualquer ambiente real; requer janela de mudança, backup e rollback aprovado |
| Segurança | `scripts/security/mobile-auth-mysql-smoke.ts` testa uso único de código PKCE, vínculo de dispositivo, revogação persistente e bloqueio de emissão após revogação | Ainda falta autorização real por banco nas rotas, prova de posse e rate limit |
| Integração Android | O contrato de sessão e dispositivos continua separado da autenticação web e preparado para App Links/Keystore | Não há App Links verificados, Keystore ou login Android habilitado |
| Testes/QA | Workflow `mobile-auth-mysql.yml` usa MySQL 8.4 descartável, aplica migrações completas e testa dois sockets MySQL físicos, tentativas concorrentes, sessão e revogação | Testes físicos Android 14–16 e pentest ainda pendentes |

## Migração 0025

A migração cria somente tabelas novas, sem alterar `users`, `incidents`, cookies, JWTs web ou dados operacionais. Armazena hashes SHA-256 de códigos, identificadores de dispositivo e handles de sessão; não contém segredos, passwords, token em claro nem posições GPS.

**Atenção ao processo de implantação:** registrar a migração no Git não equivale a executá-la no ambiente do cliente. O CI aplica o SQL exclusivamente ao `dispatch_mobile_auth_ci` em MySQL 8.4 descartável, com `NODE_ENV=test`, `CI=true` e `MOBILE_AUTH_MYSQL_SMOKE=1`. O smoke recusa outra URL, outro schema ou conexões remotas. Nenhum comando de `db:push` é disparado em produção.

## Aceite de laboratório

O smoke verifica:

1. Presença das três tabelas, chaves e índices esperados após a migração completa.
2. Unicidade de hash de dispositivo e rejeição de cadastro duplicado.
3. Hash do código PKCE em repouso e resgate único; 12 resgates simultâneos com somente um sucesso.
4. Criação de sessão curta por código e validação por consulta em conexão MySQL independente; rejeição de escopo de outra equipe e sessão expirada.
5. Revogação transacional do cadastro, códigos pendentes e sessões existentes, visível por conexão física diferente, com reemissão proibida.
6. Corrida real entre duas conexões: uma mantém o registro do dispositivo bloqueado e o revoga; a outra espera a liberação da linha e **deve falhar** ao tentar emitir código.
7. Persistência da revogação e proibição de recadastrar dispositivo revogado sob o mesmo hash.

Os testes usam identidades e dispositivos **sintéticos de CI**, sem cadastro de agente real. Não afirmam que o sistema implementa um endpoint OAuth/OIDC ou que a sessão móvel já possa autorizar mutações de campo.

## Gates de liberação não atendidos

- Revisar plano de migração, permissões DDL, backups, recuperação e reversão de schema em homologação do cliente com MySQL 8.4.
- Fluxo OAuth2 Authorization Code + PKCE S256 com autenticação no navegador do sistema, App Link verificado e validação rigorosa de issuer/state/redirect.
- Provisionamento e vínculo criptográfico do dispositivo com Android Keystore, sem bearer tokens no JavaScript da WebView.
- Autorizar cada ação sensível na mesma fronteira transacional a partir da identidade, tenant e equipe atuais no banco, sem confiar nos booleanos do cliente.
- Procedimento de revogação operacional, expurgo e auditoria LGPD; testes reais em Android 14–16, segurança e descarga de bateria.
- Permanecem bloqueadas **issue mobile #4** (login nativo) e **issue mobile #5** (GPS com tela bloqueada).

## CI

O pipeline `Qualidade` executa TypeScript, testes, build e Docker. O novo workflow `Native mobile auth MySQL 8.4 smoke (isolated)` é acionado por mudanças em schema e código móvel, em PR e na main, usando credenciais exclusivas de CI. Somente integrar à `main` com todos os gates obrigatórios aprovados no mesmo SHA.
