# Deploy conteinerizado do AXE Dispatch

Este documento descreve o deploy via Docker/Docker Compose deste repositório,
como ele está hoje. `docs/source-package/DEPLOY_CONTEINERIZADO.md` é o
documento original do pacote-fonte e ficou desatualizado em dois pontos
importantes:

- **Autenticação**: o app não usa mais OAuth. O login é local
  (usuário/senha), implementado em `server/localAuth.ts`. As variáveis
  `VITE_APP_ID`, `OAUTH_SERVER_URL` e `VITE_OAUTH_PORTAL_URL` continuam
  declaradas em `server/_core/env.ts` mas não são lidas por nenhum fluxo de
  autenticação — são vestígios do design anterior e podem ser omitidas.
- **Armazenamento**: o pacote-fonte documentava um backend S3/MinIO, mas o
  código só implementava o backend proprietário "Forge" da plataforma Manus
  (`BUILT_IN_FORGE_API_URL`/`BUILT_IN_FORGE_API_KEY`), que não existe fora
  dela. Isso foi corrigido: `server/storage.ts` agora suporta um backend
  S3-compatível (AWS S3 ou MinIO), usado automaticamente quando
  `STORAGE_S3_BUCKET`, `STORAGE_S3_ACCESS_KEY_ID` e
  `STORAGE_S3_SECRET_ACCESS_KEY` estão definidos. Sem essas variáveis, o
  Forge continua sendo usado (compatibilidade com deploys na Manus).

## Limitação conhecida: recursos exclusivos da plataforma Manus

Vários módulos (`server/_core/map.ts`, `llm.ts`, `imageGeneration.ts`,
`voiceTranscription.ts`, `notification.ts`, `heartbeat.ts`, `dataApi.ts`)
dependem de `BUILT_IN_FORGE_API_URL`/`BUILT_IN_FORGE_API_KEY` para recursos
como proxy de mapas, geração de imagem, transcrição de voz e notificações.
Fora da plataforma Manus essas variáveis não existem, então essas
funcionalidades ficam indisponíveis (falham de forma controlada, sem
derrubar o app). O núcleo operacional — ocorrências, despacho, equipes,
turnos, workflows, evidências, auditoria — funciona normalmente sem elas.

## 1. Desenvolvimento local com Compose

```bash
cp .env.container.example .env
# Edite .env: gere JWT_SECRET (openssl rand -base64 48) e defina a senha
# do administrador inicial (LOCAL_AUTH_BOOTSTRAP_PASSWORD).
docker compose up --build -d
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm create-bucket
docker compose logs -f app
```

O app fica em `http://localhost:3000` e o console do MinIO em
`http://localhost:9001` (credenciais de `.env`). Os volumes `mysql_data` e
`minio_data` preservam os dados entre reinicializações;
`docker compose down -v` remove tudo — só use após confirmar que não há
dados a preservar.

## 2. Variáveis de ambiente

Veja `.env.container.example` para a lista completa com comentários. Em
produção, mantenha os segredos em um arquivo fora do repositório com
permissões restritas (ex.: `/opt/axe-dispatch/.env.production`) e nunca os
grave em `Dockerfile`, `docker-compose.yml` versionado ou código-fonte.

| Grupo         | Variáveis obrigatórias                                | Finalidade                          |
| ------------- | ------------------------------------------------------ | ------------------------------------ |
| Aplicação     | `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`        | Execução, sessão e banco             |
| Proxy         | `TRUST_PROXY`                                           | Confiar no proxy reverso p/ HTTPS/IP |
| Administração | `LOCAL_AUTH_BOOTSTRAP_USERNAME`, `_PASSWORD`            | Cria o administrador inicial no boot |
| Armazenamento | `STORAGE_S3_BUCKET`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY` | Evidências e fotos de perfil |
| S3 opcional   | `STORAGE_S3_ENDPOINT`, `STORAGE_S3_REGION`, `STORAGE_S3_FORCE_PATH_STYLE` | Endpoint MinIO ou outro compatível |

Use `STORAGE_S3_FORCE_PATH_STYLE=true` com MinIO local. Em um bucket S3
gerenciado da AWS, normalmente basta definir `STORAGE_S3_REGION` e omitir
`STORAGE_S3_ENDPOINT`.

## 3. Build e migração para produção

```bash
docker build --target dependencies -t axe-dispatch-tools:1.15.0 .
docker run --rm --env-file /opt/axe-dispatch/.env.production \
  axe-dispatch-tools:1.15.0 corepack pnpm drizzle-kit migrate

docker build --target runtime -t axe-dispatch:1.15.0 .
docker run -d --name axe-dispatch \
  --restart unless-stopped \
  --env-file /opt/axe-dispatch/.env.production \
  -p 3000:3000 \
  axe-dispatch:1.15.0
```

Coloque Nginx, Caddy ou outro proxy reverso TLS à frente do contêiner,
encaminhando `127.0.0.1:3000`.

## 4. Verificação pós-deploy

```bash
docker logs --tail 100 axe-dispatch
curl -I http://127.0.0.1:3000/
```

Confirme que a página inicial responde, faça login com o administrador
inicial, teste um upload de evidência/foto de perfil (valida o bucket) e
revise o Log de operações para confirmar a auditoria.

## 5. Atualização e reversão

| Ordem | Ação                                                        |
| ----- | ------------------------------------------------------------ |
| 1     | Backup lógico do MySQL e validação do acesso ao bucket        |
| 2     | Construir `axe-dispatch-tools:<versão>` e aplicar migrações   |
| 3     | Construir `axe-dispatch:<versão>` e iniciar novo contêiner    |
| 4     | Validar login, operações, upload e log de auditoria           |
| 5     | Só então remover o contêiner anterior                         |

## 6. Limites conhecidos

`docker-compose.yml` é para **desenvolvimento local**; suas senhas
padrão são deliberadamente previsíveis e não devem ser usadas em produção.
Esta configuração não substitui backup, monitoração, TLS, rotação de
segredos e revisão de políticas de acesso do bucket.
