# CP-016 — CI checkpoint

Este checkpoint existe para registrar a validação automatizada da branch `feat/cp-016-operational-foundation`.

O workflow `.github/workflows/cp016-ci.yml` executa, nesta ordem:

1. instalação reproduzível com `pnpm install --frozen-lockfile`;
2. aplicação das migrations existentes em MySQL 8.4 efêmero;
3. `pnpm check`;
4. `pnpm test`;
5. `pnpm security:check`;
6. `pnpm build`.

Em 2026-09-03, o isolamento do teste visual de `Cp016OperationsPage` foi corrigido com limpeza explícita do DOM entre casos. O CI deve validar essa correção antes de qualquer homologação da branch.

Nenhum merge na `main` deve ser considerado homologado sem evidência recente desses passos.
