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

A migration CP-016 foi gerada exclusivamente pelo Drizzle Kit e persistida pelo GitHub Actions no commit `46f6d8ebde62f4c12156825035394ffa9c840803`, como `drizzle/0003_panoramic_ma_gnuci.sql`, acompanhada dos metadados de snapshot/journal. A inspeção do SQL gerado confirmou estrutura aditiva: 8 novas tabelas, constraints e índices, sem operações destrutivas de remoção de tabelas, colunas ou dados.

O próximo gate obrigatório é a execução completa do CI aplicando também a migration `0003` em um MySQL 8.4 vazio antes dos testes, segurança e build.

Nenhum merge na `main` deve ser considerado homologado sem evidência recente desses passos.
