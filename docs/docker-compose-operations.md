# AXE Dispatch — Operação com Docker Compose

## Objetivo

Este guia descreve inicialização, parada, atualização, diagnóstico, persistência, backup e restauração da stack Docker Compose do AXE Dispatch.

## Pré-requisitos

- Docker Engine com Docker Compose v2.
- Acesso ao repositório do AXE Dispatch.
- Porta externa da aplicação liberada (padrão TCP/3000).
- Arquivo `.env` criado localmente a partir de `.env.example`.

## 1. Configuração inicial

```bash
cp .env.example .env
```

Substitua todos os valores `CHANGE_ME`. Não versione `.env`. Use senhas distintas para `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` e `LOCAL_AUTH_BOOTSTRAP_PASSWORD`. Para `MYSQL_PASSWORD`, prefira caracteres URL-safe porque a credencial compõe a `DATABASE_URL` interna.

## 2. Validar configuração

```bash
docker compose config
```

A validação deve terminar sem erro. Variáveis obrigatórias ausentes bloqueiam a configuração.

## 3. Build

```bash
docker compose build
```

## 4. Inicialização

```bash
docker compose up -d
```

Fluxo esperado:

1. MySQL inicia.
2. O healthcheck do MySQL precisa ficar saudável.
3. O serviço `migrate` aplica somente as migrações Drizzle já versionadas.
4. Se a migração falhar, o serviço `app` não inicia (fail-closed).
5. Com as migrações concluídas, a aplicação inicia na porta interna 3000.

## 5. Estado e logs

```bash
docker compose ps
docker compose logs --tail=200 mysql
docker compose logs --tail=200 migrate
docker compose logs --tail=200 app
docker compose logs -f app
```

## 6. Parada normal

```bash
docker compose down
```

O volume nomeado `dispatch_mysql_data` permanece preservado.

> **ATENÇÃO:** `docker compose down -v` remove os volumes da stack e pode destruir o banco persistido. Não utilize `-v` em produção sem backup e autorização explícita.

## 7. Reinício

```bash
docker compose up -d
```

Os dados do MySQL permanecem no volume `dispatch_mysql_data` entre ciclos normais de `down` e `up`.

## 8. Atualização da aplicação

Após atualizar o código para uma versão aprovada:

```bash
docker compose build
docker compose up -d
```

A stack aplica as migrações versionadas antes de liberar a aplicação. Falha de migração bloqueia o startup.

## 9. Backup lógico do MySQL

```bash
docker compose exec -T mysql sh -c 'exec mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' > dispatch-backup.sql
```

Confirme que o arquivo foi criado, possui tamanho coerente e, para recuperação de desastre, está armazenado fora do host/container.

## 10. Restauração

A restauração altera dados existentes. Pare acessos de escrita e valide o arquivo antes de executar.

```bash
docker compose exec -T mysql sh -c 'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < dispatch-backup.sql
```

Depois:

```bash
docker compose restart app
docker compose logs --tail=200 app
```

Valide login, consultas essenciais e integridade funcional antes de liberar a operação.

## 11. Diagnóstico rápido

Se `app` não iniciar:

```bash
docker compose ps
docker compose logs --tail=200 mysql
docker compose logs --tail=200 migrate
docker compose logs --tail=200 app
```

Verifique nesta ordem:

1. variáveis obrigatórias em `.env`;
2. healthcheck do MySQL;
3. `DATABASE_URL` apontando para `mysql:3306` na rede Docker;
4. erros de migração Drizzle;
5. política do `JWT_SECRET` e credenciais de bootstrap;
6. conflito da porta externa configurada em `APP_PORT`.

## 12. Checklist antes de produção

Execute e registre evidências de:

```bash
pnpm test
pnpm check
pnpm security:check
docker compose config
docker compose build
docker compose up -d
docker compose ps
```

Também valide persistência após `docker compose down` seguido de `docker compose up -d`, login local/bootstrap e backup/restauração em ambiente controlado.

## Segurança

- Não versionar `.env`.
- Não publicar a porta 3306.
- Não utilizar senhas de exemplo em produção.
- Manter `TRUST_PROXY=false` até existir proxy reverso confiável e configurado.
- Manter `ALRT_INGRESS_MODE=desativado` enquanto o ingresso externo não for deliberadamente habilitado.
- Fazer backup antes de migrações ou atualizações relevantes.
