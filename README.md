# AXE Dispatch

Sistema de despacho e gestão de ocorrências operacionais da AXE Sistemas:
triagem, despacho de equipes/viaturas, acompanhamento em tempo real,
workflows, evidências, auditoria e integrações (incluindo ingestão ALRT).

Stack: React 19 + Vite no cliente, Express + tRPC no servidor, Drizzle ORM
sobre MySQL 8, autenticação local (usuário/senha), armazenamento de
evidências/fotos em S3 ou compatível (MinIO).

## Desenvolvimento local

```bash
pnpm install
cp .env.container.example .env   # ajuste DATABASE_URL, JWT_SECRET etc.
pnpm dev                          # http://localhost:3000
```

Comandos úteis:

```bash
pnpm check    # typecheck (tsc --noEmit)
pnpm test     # suíte Vitest
pnpm build    # build de produção (client + server)
pnpm db:push  # gera e aplica migrações Drizzle
```

## Docker / produção

Veja [`docs/deploy-docker.md`](docs/deploy-docker.md) para o guia completo
de deploy conteinerizado (Dockerfile multi-stage, `docker-compose.yml` com
MySQL e MinIO para desenvolvimento, e o processo de build/migração para
produção).

```bash
cp .env.container.example .env
docker compose up --build -d
docker compose --profile tools run --rm migrate
```

## Estrutura do projeto

```
client/    # aplicação React (Vite)
server/    # API Express/tRPC, regras de negócio, autenticação
shared/    # tipos e constantes compartilhados entre client e server
drizzle/   # schema e migrações do banco de dados
docs/      # documentação técnica e de deploy
scripts/   # scripts de verificação (cobertura tRPC, segurança, etc.)
```

## Documentação

- [`docs/architecture.md`](docs/architecture.md) — arquitetura geral
- [`docs/deploy-docker.md`](docs/deploy-docker.md) — deploy conteinerizado
- [`docs/access-control-design.md`](docs/access-control-design.md) — papéis, permissões e escopos
- [`docs/production-readiness.md`](docs/production-readiness.md) — checklist de prontidão
- [`docs/source-package/`](docs/source-package/) — documentação histórica do pacote-fonte original
