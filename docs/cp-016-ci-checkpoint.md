# CP-016 — CI checkpoint

Este checkpoint existe para registrar a validação automatizada da branch `feat/cp-016-operational-foundation`.

O workflow `.github/workflows/cp016-ci.yml` executa, nesta ordem:

1. instalação reproduzível com `pnpm install --frozen-lockfile`;
2. aplicação das migrations existentes em MySQL 8.4 efêmero;
3. `pnpm check`;
4. `pnpm test`;
5. `pnpm security:check`;
6. `pnpm build`.

Em 2026-09-03, o isolamento do teste visual de `Cp016OperationsPage` foi corrigido com limpeza explícita do DOM entre casos.

A primeira geração da migration CP-016 revelou uma incompatibilidade real com o MySQL: uma foreign key automática excedia o limite de 64 caracteres para identificadores. O schema fonte foi corrigido para declarar explicitamente a FK curta `embedded_integrations_connection_fk`, e a migration inválida foi removida antes de qualquer homologação.

A migration CP-016 foi então regenerada exclusivamente pelo Drizzle Kit e persistida pelo GitHub Actions no commit `ad99243eabe159291780b55a76084aa302b767e0`, como `drizzle/0003_marvelous_lionheart.sql`, acompanhada dos metadados de snapshot/journal. O SQL permanece aditivo, com 8 novas tabelas, constraints e índices, sem remoção de tabelas, colunas ou dados.

O gate final obrigatório é a execução completa do CI aplicando a migration `0003_marvelous_lionheart` em um MySQL 8.4 vazio antes de TypeScript, testes, segurança e build.

Nenhum merge na `main` deve ser considerado homologado sem evidência recente desses passos.
