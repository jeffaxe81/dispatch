# D-001 — Instalação reproduzível

## Contexto

O projeto declara o pnpm 10.4.1 em `packageManager`, mas também instala o pnpm 10.34.5 como dependência de desenvolvimento. Além disso, `pnpm-workspace.yaml` contém um patch para `wouter@3.7.1`, enquanto a aplicação usa `wouter@3.10.0`, e overrides antigos que não estão representados no lockfile.

## Decisão

Manter o pnpm 10.4.1 já fixado com hash em `packageManager` como ferramenta canônica deste ciclo, remover a instalação redundante do pnpm como dependência do projeto e excluir o patch e os overrides obsoletos do workspace. O lockfile continuará fixando a árvore efetivamente instalada.

## Motivo

Esta é a menor alteração capaz de restabelecer uma instalação congelada coerente. A atualização do próprio gerenciador de pacotes ficará separada para não misturar modernização de ferramenta com a recuperação da linha de base. Os pacotes citados pelos overrides já estão ausentes ou em versões iguais ou superiores no lockfile; mantê-los poderia forçar downgrades numa futura resolução.

## Consequências

- A correção será registrada no checkpoint `1.15.1`.
- `corepack pnpm install --frozen-lockfile` passa a ser o comando oficial de instalação.
- A segurança continua apoiada no lockfile e no script `security:check`, sem pinos que já não representam a árvore atual.
- O patch de coleta de rotas do Wouter é removido porque não corresponde à versão instalada e a matriz atual de rotas é gerada diretamente de `client/src/App.tsx`.
- Nenhuma biblioteca funcional da aplicação será atualizada neste ciclo.

## Validação

Executar instalação congelada em árvore limpa, teste de coerência das dependências, verificação de segurança, TypeScript, suíte automatizada e build de produção. Comparar a árvore resultante para confirmar que nenhuma biblioteca funcional foi atualizada.
