# D-012B — Definição, versão e publicação de Workflow — Plano de implementação

Data: 2026-09-13
Base: `main` em `ccdeed007977fc959a89fa5a74ca56b273e0f5db`
Branch: `feat/d012b-workflow-definition-version`

## Objetivo

Formalizar o domínio de `WorkflowDefinition`/`WorkflowVersion` sobre o workflow legado já existente, preservando o modo `SIMULAÇÃO / MOCK` e impedindo que uma edição de rascunho substitua implicitamente a versão já publicada.

A D-012B termina quando um workflow puder manter uma versão publicada imutável e, simultaneamente, evoluir uma nova versão de rascunho sem que o executor legado passe a usar esse rascunho.

## Constatação do legado

O legado já possui `workflows`, `workflow_versions`, criação de versão inicial, edição append-only, validação de grafo, publicação/desativação e auditoria. O problema de fronteira é que `currentVersion` representa a versão mais recente e também é usado pelo executor simulado. Depois de uma publicação, uma edição cria `currentVersion + 1`; enquanto não houver nova publicação, essa versão é rascunho e não pode substituir a versão publicada na execução simulada.

## Decisão de desenho

Adicionar um ponteiro explícito `publishedVersion` em `workflows`.

Semântica:

- `currentVersion`: versão mais recente do editor, publicada ou em rascunho;
- `publishedVersion`: última versão efetivamente publicada; `null` antes da primeira publicação;
- `active=true`: publicação habilitada para o executor legado simulado;
- `active=false` com `publishedVersion != null`: publicação desabilitada, histórico preservado;
- edição continua append-only: cria nova linha em `workflow_versions` e não altera `publishedVersion`;
- publicar aponta `publishedVersion = currentVersion` somente após validação de publicação;
- o executor legado simulado resolve exclusivamente `publishedVersion`, nunca um rascunho mais novo;
- versões já publicadas não são alteradas em-place.

O estado funcional `draft | published | disabled` será projetado a partir de `publishedVersion`, `currentVersion` e `active`, sem ampliar o enum persistido nesta microentrega.

## Escopo

### Incluído

1. Domínio puro de versionamento/publicação em `server/workflow/`.
2. Testes RED→GREEN para draft, publicação, desativação e resolução da versão publicada.
3. Campo `published_version` no schema e migration D-012B versionada, sem aplicação produtiva automática.
4. Backfill da migration: workflows já publicados recebem `published_version = current_version`.
5. Adaptação mínima das transações legadas para manter o ponteiro.
6. Adaptação mínima do executor legado simulado para usar a versão publicada.
7. Regressão dos testes de workflow, TypeScript, segurança, build e Docker.
8. Documento de verificação/rollback antes de retirar o PR de Draft.

### Fora do escopo

- novo engine de instâncias (D-012C);
- tarefas/assignees (D-012D);
- RBAC/multi-tenant formal do workflow (D-012E);
- eventos/gatilhos externos e idempotência persistida (D-012F);
- condições no-code novas (D-012G);
- integração D-008 (D-012H);
- SLA, designer visual, inbox/Kanban;
- deploy, migration produtiva ou grants.

## TDD / microetapas

### B1 — Contrato puro de publicação

**RED:** testes para:
- estado inicial sem versão publicada;
- edição após publicação mantém o ponteiro publicado;
- publicação promove somente `currentVersion`;
- desativação preserva `publishedVersion`;
- executor não recebe versão quando não há publicação ativa;
- executor recebe `publishedVersion`, inclusive quando existe rascunho mais novo.

**GREEN:** módulo puro `server/workflow/workflowVersioning.ts`.

### B2 — Persistência mínima

**RED:** ampliar `workflowTransactions.test.ts` para comprovar:
- criação inicia com `publishedVersion=null`;
- edição não altera `publishedVersion`;
- publicação fixa `publishedVersion=currentVersion`;
- desativação não apaga o ponteiro.

**GREEN:** schema + migration + transações em `server/db.ts`.

### B3 — Compatibilidade do executor legado

**RED:** teste prova que, com `currentVersion=2` e `publishedVersion=1`, a execução simulada usa a versão 1.

**GREEN:** executor legado seleciona somente a versão publicada ativa.

### B4 — Hardening da microentrega

- teste arquitetural para impedir regressão para `currentVersion` no ponto de resolução da execução;
- regressão completa;
- relatório de verificação;
- PR permanece Draft até todos os gates GREEN;
- merge somente após aprovação explícita.

## Migration e rollback

Migration proposta: `0009_d012b_workflow_published_version.sql`.

Forward:
1. adicionar `published_version INT NULL` em `workflows`;
2. backfill seguro para registros `status='publicado'` usando `current_version`;
3. adicionar índice se necessário após avaliação do plano de consulta.

Rollback documental:
- código anterior continua conceitualmente baseado em `currentVersion`;
- rollback de aplicação deve ocorrer antes de remover a coluna;
- remoção da coluna é operação separada e nunca automática neste ciclo.

## Gates de aceite D-012B

- versão publicada permanece estável após edição;
- nova publicação promove explicitamente o rascunho atual;
- executor legado não executa rascunho não publicado;
- validação de grafo continua fail-closed na publicação;
- nenhuma chamada externa nova;
- nenhuma alteração automática de estado crítico de ocorrência;
- sem novo engine concorrente;
- segurança, TypeScript, testes, build e Docker GREEN;
- merge somente com aprovação explícita.
