# Plano de implementação D-003 — CI com portões de qualidade

> Execute as tarefas na ordem indicada, preservando o checkpoint `checkpoint/d002-v1.15.2` e sem mesclar ou implantar automaticamente.

**Objetivo:** adicionar uma integração contínua segura que valide instalação, segurança, tipos, testes locais e build em Pull Requests e em `main`.

**Arquitetura:** um workflow GitHub Actions com um job sequencial, permissões somente de leitura, ações oficiais fixadas por SHA e nenhuma credencial da aplicação. Um teste Vitest analisa o YAML e protege as decisões de segurança e escopo.

**Tecnologias:** GitHub Actions, Node.js 24, Corepack, pnpm 10.4.1, YAML 2.9 e Vitest.

---

## Tarefa 1 — Criar o teste de configuração em estado vermelho

**Arquivo:** criar `server/ciWorkflowConfig.test.ts`.

1. Ler `.github/workflows/quality.yml` de forma segura.
2. Declarar testes para disparadores em Pull Request/push para `main` e execução manual.
3. Exigir `permissions.contents: read`, timeout e cancelamento de concorrência.
4. Exigir `ubuntu-latest`, Node 24 e cache automático desativado.
5. Exigir apenas ações oficiais fixadas por SHA completo, com as versões documentadas.
6. Exigir a ordem: instalação congelada, segurança, TypeScript, testes locais e build.
7. Proibir `test:integration`, referências a `secrets` e permissões de escrita.
8. Executar `corepack pnpm vitest run server/ciWorkflowConfig.test.ts` e confirmar falha causada somente pela ausência do workflow.

## Tarefa 2 — Implementar o workflow mínimo

**Arquivo:** criar `.github/workflows/quality.yml`.

1. Configurar os três disparadores aprovados.
2. Definir `permissions: contents: read` e `CI: true`.
3. Definir concorrência com cancelamento e timeout de 20 minutos.
4. Usar `actions/checkout` v7.0.1 no SHA `3d3c42e5aac5ba805825da76410c181273ba90b1`.
5. Usar `actions/setup-node` v7.0.0 no SHA `820762786026740c76f36085b0efc47a31fe5020`.
6. Preparar Node 24 e desativar o cache automático nesta primeira versão.
7. Habilitar Corepack e executar os cinco comandos na ordem aprovada.
8. Repetir o teste isolado e confirmar que passa.
9. Executar `git diff --check`.
10. Criar commit `ci: adicionar portões de qualidade`.

## Tarefa 3 — Validar a aplicação localmente

**Arquivos:** nenhuma alteração esperada.

1. Afastar temporariamente qualquer `dist` anterior.
2. Executar `corepack pnpm install --frozen-lockfile`.
3. Executar `corepack pnpm security:check`.
4. Executar `corepack pnpm check`.
5. Executar `corepack pnpm test` e confirmar todos os testes locais.
6. Executar `corepack pnpm test:integration` sem variáveis e confirmar a recusa controlada esperada.
7. Executar `corepack pnpm build`.
8. Confirmar branch limpa após os artefatos ignorados serem afastados.

## Tarefa 4 — Documentar e versionar o checkpoint 1.15.3

**Arquivos:** modificar `package.json`, `scripts/security-regression-check.mjs` e `docs/source-package/CHANGELOG.md`; criar `docs/decisions/D003-ci-quality-gates.md`.

1. Criar primeiro uma asserção de regressão para a versão segura esperada, se o controle atual exigir versão explícita.
2. Alterar a versão de 1.15.2 para 1.15.3, sem atualizar dependências.
3. Registrar objetivo, mudanças, validações, riscos, pendências e retorno no changelog.
4. Registrar a decisão arquitetural D-003 em linguagem didática.
5. Repetir segurança, teste de configuração e verificação de tipos.
6. Criar commit `chore: registrar checkpoint 1.15.3`.

## Tarefa 5 — Revisar e publicar a branch para validação real

**Arquivos:** nenhuma alteração planejada.

1. Revisar o diff completo desde `checkpoint/d002-v1.15.2`.
2. Procurar segredos, permissões excessivas, comandos destrutivos e alterações fora do escopo.
3. Repetir instalação, segurança, TypeScript, testes locais e build com saída atual.
4. Enviar `chore/ci-quality-gates` ao GitHub sem força.
5. Abrir ou atualizar Pull Request para `main`, sem merge automático.
6. Observar a primeira execução real e diagnosticar qualquer diferença do executor GitHub.
7. Somente após o workflow passar, criar a tag local e a branch remota `checkpoint/d003-v1.15.3`.
8. Preservar `checkpoint/d002-v1.15.2` como retorno anterior.

## Critério de encerramento

O trabalho só será declarado concluído com evidência atual de todos os comandos locais, execução real aprovada no GitHub, documentação coerente e checkpoint recuperável. A proteção obrigatória da `main` continuará como decisão posterior, baseada na primeira execução observada.
