# Docker Compose Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o AXE Dispatch executável de forma reproduzível em Docker, com aplicação e MySQL orquestrados por Docker Compose, persistência e configuração segura por ambiente.

**Architecture:** Um container `dispatch` executará o build de produção Node.js e atenderá na porta interna 3000. Um container `mysql` executará MySQL 8.4 com volume persistente e healthcheck. Os serviços compartilharão uma rede privada do Compose; apenas a aplicação terá porta publicada por padrão.

**Tech Stack:** Docker, Docker Compose, Node.js, pnpm, TypeScript, MySQL 8.4, Drizzle ORM.

**Spec:** Design aprovado em chat em 2026-09-11.

## Global Constraints

- Não inserir senhas ou segredos reais no GitHub.
- Preservar o funcionamento atual do AXE Dispatch fora de Docker.
- Usar `pnpm install --frozen-lockfile` para build reproduzível.
- Usar MySQL 8.4.
- Persistir `/var/lib/mysql` em volume Docker nomeado.
- `DATABASE_URL` do container da aplicação deve apontar para o hostname interno `mysql`.
- A aplicação deve depender do healthcheck saudável do MySQL.
- Publicar por padrão apenas a porta da aplicação.
- Não executar merge automático em `main`.

---

### Task 1: Imagem Docker da aplicação

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Produces: imagem de produção do AXE Dispatch ouvindo em `PORT=3000`.

- [ ] Criar `Dockerfile` multi-stage com Corepack/pnpm.
- [ ] Instalar dependências com `pnpm install --frozen-lockfile`.
- [ ] Executar `pnpm build` no estágio de build.
- [ ] Criar estágio runtime de produção sem ferramentas desnecessárias.
- [ ] Executar aplicação com `pnpm start`/`node dist/index.js`.
- [ ] Criar `.dockerignore` excluindo `.git`, `node_modules`, `dist`, arquivos locais `.env` e caches.
- [ ] Validar `docker build`.
- [ ] Commit: `build: add production Docker image`.

---

### Task 2: Docker Compose aplicação + MySQL

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:**
- Produces: serviços `dispatch` e `mysql`, rede interna e volume persistente.

- [ ] Definir `mysql` com imagem `mysql:8.4`, restart policy, healthcheck e volume `mysql_data`.
- [ ] Definir `dispatch` usando o `Dockerfile` local.
- [ ] Configurar `depends_on.mysql.condition: service_healthy`.
- [ ] Mapear `${APP_PORT:-3000}:3000`.
- [ ] Montar `DATABASE_URL=mysql://${MYSQL_USER}:...@mysql:3306/${MYSQL_DATABASE}` via ambiente.
- [ ] Propagar `JWT_SECRET`, `LOCAL_AUTH_BOOTSTRAP_USERNAME` e `LOCAL_AUTH_BOOTSTRAP_PASSWORD` sem defaults inseguros.
- [ ] Criar `.env.example` apenas com placeholders/documentação; nenhum segredo funcional.
- [ ] Não publicar 3306 por padrão.
- [ ] Validar `docker compose config`.
- [ ] Commit: `build: add Docker Compose stack`.

---

### Task 3: Inicialização e persistência

**Files:**
- Inspect/modify only if required: `package.json`, `drizzle.config.ts`, startup scripts.
- Create if necessary: `docker/entrypoint.sh`.

**Interfaces:**
- Consumes: MySQL saudável e `DATABASE_URL`.
- Produces: aplicação inicializada de maneira determinística.

- [ ] Verificar estratégia atual de migração Drizzle.
- [ ] Evitar concorrência de migrações em múltiplas réplicas.
- [ ] Se necessário, criar entrypoint que aplique migração antes do processo Node.
- [ ] Garantir propagação de falha de migração (fail-closed).
- [ ] Reiniciar stack e confirmar persistência dos dados após `docker compose down`/`up` sem `-v`.
- [ ] Commit: `build: make Docker startup deterministic`.

---

### Task 4: Validação e documentação operacional

**Files:**
- Modify/Create: documentação Docker em `docs/`.

**Interfaces:**
- Produces: procedimento reproduzível de implantação e recuperação.

- [ ] Executar `docker compose config`.
- [ ] Executar `docker compose build`.
- [ ] Executar `docker compose up -d`.
- [ ] Confirmar healthcheck MySQL.
- [ ] Confirmar acesso HTTP ao AXE Dispatch na porta configurada.
- [ ] Validar login local/bootstrap.
- [ ] Executar regressão disponível: `pnpm test`, `pnpm check`, `pnpm security:check` e build.
- [ ] Documentar `up`, `down`, `logs`, atualização, backup e restauração.
- [ ] Registrar que `docker compose down -v` remove o volume de banco e é destrutivo.
- [ ] Criar checkpoint final na branch e abrir PR; não fazer merge sem aprovação.
