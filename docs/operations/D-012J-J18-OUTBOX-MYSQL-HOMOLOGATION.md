# D-012J J18 — Ensaio físico da outbox de integrações (MySQL 8.4)

## Objetivo e segurança

Comprovar em um MySQL **real e descartável** o comportamento de CAS/fencing das entregas J15, J16 e J17. Este ensaio usa um schema **exclusivo**, separado tanto da base operacional como da suíte SLA I5E, e executa migrations apenas depois de atestar schema vazio e versão MySQL 8.4.

A rotina é opt-in: exige `NODE_ENV=test`, `AXE_RUNTIME_ENV=homologation`, `AXE_INTEGRATION_MYSQL_TESTS=true` e URL local para **somente** o schema `dispatch_integration_homologation` com usuário `integration_test`. Não aceita URLs de produção, schema reaproveitado nem credenciais não previstas. Nunca envia eventos para terceiros.

## Componentes

- `server/test/integrationOutboxMysqlEnvironment.ts` — isolamento e fail-closed ambiental.
- `server/integrationOutbox.mysql-homologation.ts` — seis cenários em conexões físicas MySQL distintas.
- `vitest.integration-outbox-mysql.config.ts` — suíte isolada para não colidir com o `beforeAll` da homologação SLA.
- `tsconfig.integration-outbox-mysql.json` — verificação TypeScript isolada.
- `.github/workflows/integration-outbox-mysql-homologation.yml` — serviço MySQL 8.4, migrations e relatórios JUnit com artefato.

## Matriz de testes

1. Migração aditiva 0018 e FK/idempotência tenant-scoped reais.
2. Dois workers físicos partindo da mesma versão → **somente um CAS vence**.
3. Quarentena após lease expirado; confirmação atrasada de worker perde CAS.
4. Dois recuperadores simultâneos → somente uma transição de quarentena.
5. Rollback real restaura estado `pending` sem efeitos parciais.
6. Tentativa de recuperação prematura é bloqueada no limiar de expiração.

## Limitações e gates

A prova executa só a camada de armazenamento; não efetua chamadas externas, envio de payload nem alteração de Ocorrências. `dead_letter` significa **resultado externo desconhecido**, não garantia de falha remota. Não ativa scheduler, replay ou endpoint administrativo. Ainda exigem aprovação: reconciliação J13 #145/#146 e J16 #151/#152, auditoria transacional de intervenção, RBAC tenant-scoped e validação de clock skew entre hosts.

**Não aplicar migration produtiva nem realizar deploy por esta PR.**
