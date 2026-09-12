# Motor de Ativos / Inventário — M0 Fundação, Contratos e Isolamento

**Data:** 2026-09-12  
**Épico:** #66  
**Branch:** `feat/inventory-m0-foundation-20260912`  
**Checkpoint:** `checkpoint/pre-inventory-m0-20260912`  
**Base:** `main` em `5532174ca9c268a26481272c1cbe76a011f5b2a4`

## Objetivo

Provar a separação arquitetural entre Sistema de Despacho e Motor de Ativos antes de qualquer regra de negócio, tabela ou persistência do Inventário. O Despacho deve conhecer somente contratos versionados de integração; o banco, schemas e repositórios do Motor de Ativos permanecem fora deste produto.

## Referências aprovadas

- Épico #66 — Motor de Ativos / Inventário.
- Design aprovado em `design/inventory-assets-20260910`: `docs/superpowers/specs/2026-09-10-inventory-assets-engine-design.md`.
- Plano de microentregas em `design/inventory-assets-20260910`: `docs/superpowers/plans/2026-09-10-inventory-assets-engine-microdeliveries.md`.

## Restrições da M0

- Nenhuma migration ou tabela de Inventário no banco do Despacho.
- Nenhuma conexão direta do Despacho ao banco do Motor de Ativos.
- Nenhum grant ou segredo produtivo.
- Nenhum endpoint de negócio de ativos nesta microentrega.
- Nenhum deploy ou merge em `main` sem autorização explícita.
- REST e eventos usam contratos versionados, identidade de tenant/usuário, correlação e validação fail-closed.

## Task 1 — Contrato versionado de integração

**Arquivos:**
- criar `shared/inventoryIntegration/v1.test.ts`;
- criar `shared/inventoryIntegration/v1.ts` somente depois do RED.

**RED:** testar a API de contrato ainda inexistente por import dinâmico. O teste deve exigir:
- versão REST `v1` e versão do envelope `1`;
- identidade com `tenantId` e `userId` opacos e não vazios;
- `correlationId` obrigatório no contexto de integração;
- `idempotencyKey` opcional e validado quando presente;
- envelope de erro estrito, sem stack ou campos desconhecidos;
- envelope canônico de evento com `eventId`, `eventType`, `occurredAt`, `tenantId`, `correlationId`, `producer` e `payload`.

**GREEN:** implementar apenas schemas Zod, tipos inferidos e constantes necessárias aos testes. Não importar `drizzle`, `server/db` ou entidades de persistência.

**Verificação focal:** `corepack pnpm vitest run shared/inventoryIntegration/v1.test.ts --config vitest.config.ts`.

## Task 2 — Teste arquitetural de isolamento

**Arquivo:** criar `server/inventoryArchitectureBoundary.test.ts` antes da documentação/estrutura que ele exige.

**RED:** o teste deve falhar enquanto a fronteira formal não estiver registrada e deve verificar:
- existência do contrato em `shared/inventoryIntegration/v1.ts`;
- ausência de imports de persistência (`drizzle`, `server/db`, `mysql2` ou caminhos `db/schema/repository/persistence`) dentro da camada de contrato;
- ausência dos sinais explícitos `INVENTORY_DATABASE_URL`, `ASSET_INVENTORY_DATABASE_URL`, `inventoryDb` e `assetInventoryDb` no código de runtime do Despacho;
- ausência de tabelas reservadas do produto Inventário (`asset_inventory_*` e `inventory_asset_*`) em `drizzle/schema.ts` e migrations;
- existência do documento de fronteira com regras REST/eventos e proibição de SQL/gravação cruzada.

**GREEN:** criar apenas a documentação e a fronteira necessárias. Nenhum acesso a banco externo será adicionado.

**Verificação focal:** `corepack pnpm vitest run server/inventoryArchitectureBoundary.test.ts --config vitest.config.ts`.

## Task 3 — Documento operacional da fronteira

**Arquivo:** `docs/architecture/inventory-assets-boundary.md`.

Registrar:
- ownership: Inventário possui seu banco e estado; Despacho possui ocorrências/ordens;
- integração somente por REST versionado e eventos versionados;
- tenant/usuário/correlação e idempotência em comandos críticos;
- falha fechada para identidade/escopo/contrato inválidos;
- observabilidade mínima por correlação, resultado e latência, sem payload sensível;
- rollback da M0 por reversão de contratos/docs, sem rollback de banco porque não há migration;
- checklist explícito de segurança, observabilidade, rollback e documentação.

## Task 4 — Regressão completa

Executar, nesta ordem:
1. `corepack pnpm security:check`;
2. `corepack pnpm check`;
3. `corepack pnpm test`;
4. `corepack pnpm build`.

A CI do PR também deverá permanecer GREEN. Nenhuma alteração de banco real é autorizada.

## Task 5 — Revisão e entrega

- revisar diff para confirmar ausência de migrations, tabelas, grants e conexões de Inventário;
- registrar no PR o checkpoint/base e as evidências RED → GREEN;
- atualizar o épico #66 com o resultado da M0;
- manter o PR sem merge até aprovação explícita do responsável.

## Critério de conclusão da M0

A M0 está pronta para aprovação quando os contratos `v1` estiverem validados, o teste arquitetural comprovar a fronteira sem persistência cruzada, os checks completos estiverem GREEN e o diff não contiver migration, tabela ou conexão direta ao banco do Motor de Ativos.