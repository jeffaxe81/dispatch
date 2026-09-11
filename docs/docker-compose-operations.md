# AXE Dispatch — Operação com Docker Compose

## Objetivo

Este guia descreve a inicialização, parada, atualização, diagnóstico básico, persistência e procedimentos de backup/restauração da stack Docker Compose do AXE Dispatch.

## Pré-requisitos

- Docker Engine com Docker Compose v2.
- Acesso ao repositório do AXE Dispatch.
- Portas liberadas para a aplicação (padrão: TCP/3000).
- Arquivo `.env` criado localmente a partir de `.env.example`.

## 1. Configuração inicial

```bash
cp .env.example .env
```

Edite `.env` e substitua todos os valores `CHANGE_ME`. Não versione o arquivo `.env`.

Use senhas distintas para `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` e `LOCAL_AUTH_BOOTSTRAP_PASSWORD`. O `JWT_SECRET` deve ser aleatório e forte.

## 2. Validar configuração

Antes de subir a stack:

```bash
docker compose config
```

A validação deve terminar sem erro. Não prossiga se variáveis obrigatórias estiverem ausentes.

## 3. Build

```bash
docker compose build
```

## 4. Inicialização

```bash
docker compose up -d
```

O fluxo esperado é:

1. MySQL inicia.
2. O healthcheck do MySQL precisa ficar saudável.
3. O container `dispatch` executa somente as migrações Drizzle já versionadas.
4. Se a migração falhar, a aplicação não inicia (fail-closed).
5. Com migrações concluídas, o processo Node inicia na porta interna 3000.

## 5. Estado e logs

```bash
docker compose ps
docker compose logs --tail=200 mysql
docker compose logs --tail=200 dispatch
docker compose logs -f dispatch
```

## 6. Parada normal

```bash
docker compose down
```

O volume nomeado `mysql_data` permanece preservado.

> **ATENÇÃO:** `docker compose down -v` remove os volumes da stack e pode destruir o banco persistido. Não utilize `-v` em produção sem backup e autorização explícita.

## 7. Reinício

```bash
docker compose up -d
```

Dados do MySQL devem permanecer no volume `mysql_data` entre ciclos normais de `down` e `up`.

## 8. Atualização da aplicação

Após atualizar o código para uma versão aprovada:

```bash
docker compose build dispatch
docker compose up -d
```

A aplicação aplicará as migrações versionadas antes de iniciar. Uma falha de migração bloqueia o startup.

## 9. Backup lógico do MySQL

Crie um diretório local protegido para os backups e execute:

```bash
docker compose exec -T mysql sh -c 'exec mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' > dispatch-backup.sql
```

Confirme que `dispatch-backup.sql` foi criado, possui tamanho coerente e está armazenado fora do host/container quando o objetivo for recuperação de desastre.

## 10. Restauração

A restauração é uma operação destrutiva sobre os dados existentes. Pare acessos de escrita e valide o arquivo antes de executar.

```bash
docker compose exec -T mysql sh -c 'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < dispatch-backup.sql
```

Após restaurar:

```bash
docker compose restart dispatch
docker compose logs --tail=200 dispatch
```

Valide login, consultas essenciais e integridade funcional antes de liberar a operação.

## 11. Diagnóstico rápido

Se `dispatch` não iniciar:

```bash
docker compose ps
docker compose logs --tail=200 mysql
docker compose logs --tail=200 dispatch
```

Verifique nesta ordem:

1. Variáveis obrigatórias em `.env`.
2. Healthcheck do MySQL.
3. `DATABASE_URL` apontando para `mysql:3306` dentro da rede Docker.
4. Erros de migração Drizzle.
5. Erros de política de segurança do `JWT_SECRET` ou credenciais bootstrap.
6. Conflito da porta externa configurada em `APP_PORT`.

## 12. Checklist antes de produção

Executar e registrar evidências de:

```bash
pnpm test
pnpm check
pnpm security:check
docker compose config
docker compose build
docker compose up -d
docker compose ps
```

Também validar persistência após `docker compose down` seguido de `docker compose up -d`, login local/bootstrap, backup e restauração em ambiente controlado.

## Segurança

- Não versionar `.env`.
- Não publicar a porta 3306 por padrão.
- Não utilizar senhas de exemplo em produção.
- Manter `TRUST_PROXY=false` até existir proxy reverso confiável e explicitamente configurado.
- Manter `ALRT_INGRESS_MODE=desativado` enquanto o ingresso externo não for deliberadamente habilitado.
- Fazer backup antes de migrações/atualizações relevantes.
