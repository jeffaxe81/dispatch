# Pacote integrado AXE Despacho + Central de Alertas (opcional)

O **AXE Despacho** continua no repositório `jeffaxe81/dispatch`.
A **Central de Alertas** continua em
`jeffaxe81/central-despacho-alertas-publicacao`. Este pacote os instala
na mesma implantação Docker Compose, mas não junta os códigos nem os
bancos, não exige que um serviço esteja disponível para que o outro
inicie e não altera o recebimento de ocorrências do despacho.

## Implantação

Pré-requisitos: Docker Engine/Compose v2, Docker BuildKit e acesso ao GitHub
para obter o commit versionado da Central de Alertas. A instalação inicial
não altera o serviço de Despacho já existente sem a aplicação explícita
do arquivo `compose.alerts.yml`.

```bash
cp .env.example .env
cp .env.alerts.example .env.alerts
# Configure senhas fortes e exclusivas nos dois arquivos.
docker compose --env-file .env --env-file .env.alerts \
  -f docker-compose.yml -f compose.alerts.yml \
  --profile alerts config --quiet
docker compose --env-file .env --env-file .env.alerts \
  -f docker-compose.yml -f compose.alerts.yml \
  --profile alerts up --build -d
```

Endereços locais padrão: Despacho `http://localhost:3000`; Alertas
`http://localhost:3003`. O módulo Alertas escuta **somente em
127.0.0.1** no host. Para acesso remoto, use um proxy reverso autenticado
e TLS, nunca publique a porta sem controle de acesso.

No perfil `alerts`, os serviços são:

- `alerts-mysql`: MySQL próprio, volume `alerts_mysql_data`, sem porta
  de banco exposta no host.
- `alerts-migrate`: migração Drizzle própria antes da aplicação iniciar.
- `alerts-app`: painel e Motor Universal de Eventos, com autenticação e
  segredos próprios, verificações `/health/live` e `/health/ready`.
- `app`: Despacho original, sem dependência de `alerts-app`.

O canal `alerts-api-net` permite futuramente chamadas autenticadas
Alertas → `http://app:3000`. O banco Alertas vive somente em
`alerts-db-net`; a aplicação Despacho **não** é conectada a esse banco.
A autenticação de cada aplicação continua independente nesta fase; o
pacote único ainda não implementa SSO ou um painel administrativo único.

## Segurança por padrão

- A Central permanece em **modo teste/mock** após instalação.
- O `ALRT_INGRESS_MODE=desativado` do Despacho não é alterado por este pacote.
- Não configure endpoints ALRT→AXE reais nem tokens entre módulos sem
  homologar contrato, assinaturas, replay, idempotência e auditoria.
- `ALERTS_JWT_SECRET`, `ALERTS_MYSQL_PASSWORD` e
  `ALERTS_MYSQL_ROOT_PASSWORD` devem ser novos e distintos dos segredos
  do Despacho. As senhas no exemplo são marcadores não utilizáveis em produção.
- Como a URL MySQL é construída no Compose, use senhas com caracteres
  próprios de URI ou percent-encode caracteres reservados no valor
  interpolado (ex.: `@`, `:`, `/`, `#`).
- Não é necessário disponibilizar porta 3306/3307 dos bancos para o host.

## Versionamento do módulo

`compose.alerts.yml` fixa o commit upstream `c237fa9b88407ca72df835309bc2ced5ec873465` da
Central de Alertas. O Docker realiza o build a partir desse commit,
evitando atualizações silenciosas de `main`. A revisão pode ser atualizada
separadamente do Despacho depois de os testes de compatibilidade passarem.

Para desenvolvimento e produção sem acesso direto ao GitHub no build,
faça checkout do código de Alertas no commit acima em
`./.modules/alerts` e configure `ALERTS_BUILD_CONTEXT=./.modules/alerts`
no arquivo `.env.alerts`. Esse diretório é ignorado pelo Git.

## Inspeção, rollback e backup

```bash
docker compose --env-file .env --env-file .env.alerts \
  -f docker-compose.yml -f compose.alerts.yml \
  --profile alerts ps
docker compose --env-file .env --env-file .env.alerts \
  -f docker-compose.yml -f compose.alerts.yml \
  --profile alerts stop alerts-app alerts-migrate alerts-mysql
```

A parada dos Alertas não interrompe o Despacho. Preserve **separadamente**
o volume `alerts_mysql_data` antes de migrações e upgrades, e nunca use
`down -v` como procedimento de rollback. Voltar para um commit anterior
do código não reverte automaticamente o schema do banco.

## Portões mínimos de homologação

1. `docker compose ... config --quiet` e testes de estrutura do pacote.
2. Build dos dois serviços e migração limpa no banco exclusivo de alertas.
3. Testes de `/health/live` e `/health/ready`.
4. Falha/stop de `alerts-app` sem interrupção do Despacho.
5. Envio sintético (shadow/mock) sem criar ocorrência real.
6. Somente após avaliação de segurança, testes do contrato ALRT→AXE
   com chave, HMAC, idempotência, prioridade, geolocalização e auditoria.

O pacote **não é autorização de produção**: disponibilizar o orquestrador
não substitui testes reais no ambiente de destino.
