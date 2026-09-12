# M14 — Experiência do ativo dentro do Despacho

## Objetivo

Disponibilizar contexto de ativos dentro do detalhe de uma ocorrência sem duplicar o módulo de Inventário e sem criar dependência operacional do Motor de Ativos para o núcleo do Despacho.

## Fluxo operacional

Na tela de detalhe da ocorrência, o painel **Ativo relacionado** permite:

1. pesquisar ativos por código ou nome;
2. selecionar um ativo e carregar seu resumo contextual;
3. consultar a localização do ativo, quando disponível;
4. visualizar ativo e ocorrência no mapa operacional;
5. registrar no Motor de Ativos a referência da ocorrência;
6. abrir o prontuário completo no produto de Inventário configurado.

## Degradação controlada

Se o Motor de Ativos estiver indisponível, apenas o painel de Inventário apresenta estado de erro e opção de nova tentativa. Consulta, edição, despacho, transições, NEO e demais funções da ocorrência continuam operacionais.

## Contratos e isolamento

- O Despacho utiliza somente o `AssetInventoryClient` REST versionado.
- Não há consulta ou escrita direta no banco do Motor de Ativos.
- Tenant, usuário e `correlation-id` são propagados para o contrato REST.
- Quando houver exatamente uma organização no escopo dinâmico do usuário, seu identificador é usado como tenant do Inventário.
- Ambientes legados/single-tenant podem configurar `ASSET_INVENTORY_TENANT_ID`.
- Mais de uma organização sem contexto único resulta em falha restrita ao Inventário; o sistema não escolhe tenant por inferência.

## Configuração

- `ASSET_INVENTORY_BASE_URL`: URL REST do Motor de Ativos.
- `ASSET_INVENTORY_WEB_URL`: URL do produto responsável pelo prontuário completo.
- `ASSET_INVENTORY_TENANT_ID`: fallback de tenant para ambiente legado/single-tenant.
- `ASSET_INVENTORY_TIMEOUT_MS`: timeout do cliente REST; padrão 3000 ms.

## Correção complementar da M13

A M14 completa uma lacuna identificada na M13: o cliente REST passa a expor `getLocation`, correspondente a `GET /api/v1/assets/:id/location`, requisito já previsto no plano aprovado da M13.

## Segurança e autorização

A leitura do contexto requer acesso a ocorrências. Agentes podem visualizar o contexto, mas não registrar vínculo de ocorrência com o ativo. O vínculo é idempotente no Motor de Ativos e não altera automaticamente estado crítico do Despacho.

## Rollback

O rollback da M14 consiste em retirar o `IncidentAssetContext` da tela e remover o `assetInventoryRoot` do `rootRouter`. Não há migration de banco do Despacho nem alteração de dados operacionais existente.

## Fora de escopo

- replicação do prontuário no Despacho;
- consultas SQL entre produtos;
- sincronização por polling obrigatório;
- regras automáticas de despacho baseadas no ativo;
- grants, migration ou deploy produtivo.
