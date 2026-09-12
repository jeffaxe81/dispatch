# Inventário R1 — Evidência Funcional

## Execução

- Head validado: `85b4be6e06b11cc52908fbeb05fc5588dc7ba471`
- Workflow Qualidade: run `1077` / id `34721110882`
- Resultado global do job: `success`

## Evidências do fluxo Inventário → Despacho

Na suíte fresca do R1 foram confirmados:

- `server/assetInventoryClient.test.ts`: 4 testes GREEN;
- `server/assetInventoryEventConsumer.test.ts`: 4 testes GREEN;
- `client/src/components/AssetContextPanel.test.tsx`: 2 testes GREEN;
- `server/inventoryIntegrationContract.test.ts`: 5 testes GREEN;
- `server/inventoryReleaseReadiness.test.ts`: 3 testes GREEN.

O painel M14 validou pesquisa, seleção e contextualização do ativo sem interromper o fluxo da ocorrência. O cliente REST e o consumidor de eventos permaneceram cobertos pela suíte de regressão.

## Comportamentos homologados por automação

- pesquisa e consulta de ativos por contrato;
- consulta de localização;
- vínculo de referências de ocorrência/ordem/atividade;
- propagação de identidade/correlação prevista no contrato;
- falha controlada da integração;
- deduplicação/idempotência de eventos;
- fail-closed para envelope incompatível;
- tipo desconhecido sem alteração automática de regra crítica;
- painel de ativo sem paralisação do fluxo principal da ocorrência.

## Limite da evidência

Esta homologação é **automatizada em CI e ambiente Docker controlado**. Ela não substitui uma sessão manual contra uma instância externa real do Motor de Ativos em ambiente de homologação. Esse ponto permanece como ressalva para a decisão Go/No-Go de produção.

## Resultado

**GREEN — homologação funcional automatizada aprovada.**