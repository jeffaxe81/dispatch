# Inventário R1 — Evidência de Regressão, Build e Empacotamento

## Head e workflows

- Head da execução fresca: `85b4be6e06b11cc52908fbeb05fc5588dc7ba471`
- Qualidade: run `1077` / id `34721110882` — SUCCESS
- NEO external compatibility: run `968` / id `34721110894` — SUCCESS
- GIS visual homologation: run `1030` / id `34721110907` — SUCCESS
- NEO workspace visual homologation: run `1010` / id `34721110893` — SUCCESS

## Resultados da suíte

- Segurança: GREEN
- TypeScript: GREEN
- Test files: **250 passed / 250**
- Tests: **1160 passed / 1160**
- Duração Vitest registrada: **77.12 s**
- Build Vite/esbuild: GREEN
- Empacotamento Docker Compose: GREEN
- MySQL 8.4 no ambiente de CI: saudável
- Serviço da aplicação: iniciou no Compose e passou no gate do workflow

## Coberturas relevantes ao Inventário

- `server/assetInventoryClient.test.ts`: GREEN
- `server/assetInventoryEventConsumer.test.ts`: GREEN
- `client/src/components/AssetContextPanel.test.tsx`: GREEN
- `server/inventoryIntegrationContract.test.ts`: GREEN
- `server/inventoryArchitectureBoundary.test.ts`: GREEN
- `server/inventoryReleaseReadiness.test.ts`: GREEN
- `server/multiTenantBoundary.test.ts`: GREEN
- `server/authorization.test.ts`: GREEN

O gate M16 continua validando carga mínima de eventos e fail-closed do consumidor.

## Avisos observados no build

Foram registrados avisos não bloqueantes:

1. `%VITE_ANALYTICS_ENDPOINT%` e `%VITE_ANALYTICS_WEBSITE_ID%` não estavam definidos no ambiente de CI;
2. o Vite registrou bundle/chunk acima do limite de aviso de 500 kB;
3. `LeafletOperationalMap.tsx` possui importação dinâmica e também estática em alguns consumidores, reduzindo o benefício de code splitting.

Nenhum desses avisos gerou falha de teste, build ou Docker. Eles devem permanecer como risco técnico/otimização no pacote Go/No-Go, sem expansão automática de escopo neste ciclo.

## Resultado

**GREEN COM AVISOS — regressão, build e empacotamento aprovados; avisos registrados como riscos residuais não bloqueantes.**