# Deploy conteinerizado do AXE Dispatch

**Versão de referência:** 1.15.0  
**Responsável pelo documento:** Manus AI

## Objetivo e arquitetura

Esta configuração executa o AXE Dispatch como um serviço Node.js que entrega simultaneamente a API tRPC, os endpoints OAuth, o proxy de arquivos e a interface React já compilada. O banco MySQL e o armazenamento de objetos não são incorporados na imagem da aplicação: são serviços persistentes e substituíveis por equivalentes gerenciados em produção.

| Componente     | Desenvolvimento local      | Produção recomendada          | Persistência                 |
| -------------- | -------------------------- | ----------------------------- | ---------------------------- |
| Aplicação      | Contêiner `app` Node.js    | Imagem `axe-dispatch`         | Não mantém estado local      |
| Banco de dados | Contêiner `mysql`          | MySQL 8 compatível gerenciado | Volume ou serviço gerenciado |
| Arquivos       | MinIO                      | Bucket S3 compatível          | Bucket externo               |
| Identidade     | Provedor OAuth configurado | Provedor OAuth corporativo    | Serviço externo              |

> A aplicação mantém no banco apenas as chaves e os metadados de evidências e fotos. Os bytes ficam no armazenamento de objetos.

## 1. Pré-requisitos

Instale Docker Engine e o plugin Docker Compose na máquina de desenvolvimento ou no servidor. Para produção, providencie um domínio HTTPS, uma instância MySQL 8 compatível, um bucket S3 compatível e credenciais de OAuth. A aplicação recebe a porta de escuta por `PORT`; use a porta interna `3000` atrás de um proxy reverso TLS.

## 2. Desenvolvimento local com Compose

Copie o modelo de ambiente e ajuste principalmente os dados de OAuth. O arquivo local não deve ser enviado ao repositório.

```bash
cp .env.container.example .env
# Edite .env, gere JWT_SECRET com ao menos 32 bytes aleatórios e configure OAuth.
docker compose up --build -d
docker compose --profile tools run --rm migrate
docker compose logs -f app
```

O aplicativo ficará disponível em `http://localhost:3000`. O console do MinIO estará disponível em `http://localhost:9001`; ele usa as credenciais de desenvolvimento declaradas em `docker-compose.yml`. Antes de testar login local, cadastre esta URL de retorno no provedor de identidade:

```text
http://localhost:3000/api/oauth/callback
```

Os volumes `mysql_data` e `minio_data` preservam os dados entre reinicializações. Para remover todos os dados locais de desenvolvimento, execute o comando abaixo **somente após confirmar que não há dados a preservar**.

```bash
docker compose down -v
```

## 3. Variáveis de ambiente

| Grupo         | Variáveis obrigatórias                                                          | Finalidade                                    |
| ------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| Aplicação     | `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`                                | Execução, sessão e banco                      |
| Proxy         | `TRUST_PROXY`                                                                   | Confiar no primeiro proxy para HTTPS/IP       |
| OAuth         | `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`                      | Autenticação e retorno de login               |
| Administração | `OWNER_OPEN_ID`, `OWNER_NAME`                                                   | Identidade inicial de administração           |
| S3            | `STORAGE_S3_BUCKET`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY` | Armazenamento de evidências e fotos           |
| S3 opcional   | `STORAGE_S3_ENDPOINT`, `STORAGE_S3_REGION`, `STORAGE_S3_FORCE_PATH_STYLE`       | Endpoint MinIO ou outro fornecedor compatível |

Use `STORAGE_S3_FORCE_PATH_STYLE=true` com MinIO local. Mantenha `TRUST_PROXY=false` em acesso direto e defina `true` somente quando existir exatamente um proxy reverso confiável antes do aplicativo. Em um serviço S3 gerenciado, normalmente defina a região e omita `STORAGE_S3_ENDPOINT`; valide o comportamento com o fornecedor escolhido. Nunca grave chaves, senhas ou URLs privadas em `Dockerfile`, `docker-compose.yml` versionado ou código fonte.

## 4. Construção e migração para produção

Crie um arquivo de segredos fora do repositório, por exemplo `/opt/axe-dispatch/.env.production`, com permissões restritas. Nele, utilize um `DATABASE_URL` apontando para o banco de produção, uma `JWT_SECRET` longa e exclusiva, as credenciais do bucket e os dados OAuth de produção.

Primeiro, gere a imagem de ferramentas e aplique as migrações uma única vez por release. O estágio `dependencies` mantém as dependências de desenvolvimento necessárias ao Drizzle; a imagem de runtime não as carrega.

```bash
docker build --target dependencies -t axe-dispatch-tools:1.15.0 .
docker run --rm --env-file /opt/axe-dispatch/.env.production \
  axe-dispatch-tools:1.15.0 corepack pnpm drizzle-kit migrate
```

Depois, gere e inicie a imagem de runtime.

```bash
docker build --target runtime \
  --build-arg VITE_APP_ID="seu-client-id" \
  --build-arg VITE_OAUTH_PORTAL_URL="https://seu-portal-oauth.example" \
  -t axe-dispatch:1.15.0 .
docker run -d --name axe-dispatch \
  --restart unless-stopped \
  --env-file /opt/axe-dispatch/.env.production \
  -p 3000:3000 \
  axe-dispatch:1.15.0
```

Coloque Nginx, Caddy ou outro proxy reverso TLS à frente do contêiner. Configure o domínio público, encaminhe o tráfego HTTPS para `127.0.0.1:3000` e cadastre o callback definitivo no OAuth:

```text
https://dispatch.seu-dominio.example/api/oauth/callback
```

## 5. Verificação pós-deploy

Verifique se o serviço iniciou, se a página inicial responde e se o callback OAuth não retorna erro. Faça um teste controlado de upload de foto de perfil ou evidência para confirmar o bucket, e revise o Log de operações para confirmar a auditoria.

```bash
docker logs --tail 100 axe-dispatch
curl -I http://127.0.0.1:3000/
```

## 6. Atualização e reversão

Em cada versão, faça backup do banco e confirme que o bucket está protegido por política de retenção apropriada. Publique a nova imagem com uma tag versionada, aplique a migração antes de trocar o contêiner e mantenha a imagem anterior disponível para reversão de aplicação. Migrações que removam ou transformem dados exigem backup e plano de reversão próprios.

| Ordem | Ação                                                        |
| ----- | ----------------------------------------------------------- |
| 1     | Fazer backup lógico do MySQL e validar o acesso ao bucket   |
| 2     | Construir `axe-dispatch-tools:<versão>` e aplicar migrações |
| 3     | Construir `axe-dispatch:<versão>` e iniciar novo contêiner  |
| 4     | Validar login, operações, upload e log de auditoria         |
| 5     | Só então remover o contêiner anterior                       |

## 7. Limites conhecidos

O `docker-compose.yml` é voltado a **desenvolvimento local**; suas senhas são deliberadamente previsíveis e não podem ser usadas em produção. A execução de tarefas agendadas, quando necessária, deve ser tratada como processo ou serviço separado e persistente, não como dados em memória do contêiner da aplicação. A configuração atual não substitui a necessidade de backup, monitoração, TLS, rotação de segredos e revisão de políticas de acesso do OAuth e do bucket.
