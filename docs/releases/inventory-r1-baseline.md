# Inventário R1 — Baseline de Homologação

## Identificação

- Repositório: `jeffaxe81/dispatch`
- Branch de preparação: `release/inventory-homologation-20260912`
- Baseline da `main`: `c59b11084e6451ba13ccc49bb0fa8c078691ae36`
- Merge correspondente: M16 — hardening final do Inventário
- Versão da aplicação: `2.18.0`
- Data de congelamento: 2026-09-12

## Head de validação M16

O candidato validado antes do merge final foi:

`413103b1685b232b5f52350d0dbe53499bd52124`

Workflows confirmados como `success` nesse SHA:

- Qualidade — run `1075` / id `34720275966`
- NEO external compatibility — run `967` / id `34720275945`
- GIS visual homologation — run `1029` / id `34720275949`
- NEO workspace visual homologation — run `1009` / id `34720275950`

Estas evidências são baseline de entrada. O ciclo R1 exige evidência fresca adicional antes do Go/No-Go.

## Contratos congelados para homologação

- REST versionado do Motor de Ativos para pesquisa, detalhe, localização e vínculo com ocorrência/ordem/atividade.
- Propagação de identidade e correlação por `tenantId`, `userId` e `correlationId`.
- Consumidor versionado de eventos do ativo com deduplicação/idempotência.
- Fail-closed para envelope/evento incompatível.
- Eventos do Motor não alteram automaticamente estado crítico da ocorrência.
- Indisponibilidade do Motor degrada apenas as funções de inventário e não paralisa o núcleo do Despacho.

## Scripts de verificação disponíveis

Conforme `package.json` da baseline:

- `corepack pnpm security:check`
- `corepack pnpm check`
- `corepack pnpm test`
- `corepack pnpm test:all`
- `corepack pnpm test:integration`
- `corepack pnpm build`
- `corepack pnpm test:gis-visual`
- `corepack pnpm test:neo-visual`
- `corepack pnpm smoke:post-deploy` — utilizar somente em ambiente autorizado e após deploy controlado; não executar em produção neste ciclo.

## Restrições de release

Esta baseline não autoriza:

- `db:migrate` ou `db:push` em produção;
- criação de grants produtivos;
- deploy produtivo;
- alteração dos requisitos de negócio;
- inclusão automática de novas funcionalidades.

Qualquer saída para produção exige decisão Go/No-Go documentada e autorização explícita posterior.