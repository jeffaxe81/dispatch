# CP-016 — CI checkpoint

Este checkpoint existe para registrar a validação automatizada da branch `feat/cp-016-operational-foundation`.

O workflow `.github/workflows/cp016-ci.yml` executa, nesta ordem:

1. instalação reproduzível com `pnpm install --frozen-lockfile`;
2. `pnpm check`;
3. `pnpm test`;
4. `pnpm security:check`;
5. `pnpm build`.

Nenhum merge na `main` deve ser considerado homologado sem evidência recente desses passos.
