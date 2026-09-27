# D-012H — Integração com Formulários D-008 — Implementation Plan

**Base atual:** `main` no commit `ba9438a3441204ab96415950c2dbed0f3fd6a0de` após integração da D-012G.
**Branch:** `feat/d012h-forms-integration`
**Checkpoint pré-implementação:** `checkpoint/pre-d012h-forms-integration-20260927`

## Objetivo

Permitir que uma etapa/tarefa do Workflow referencie um formulário publicado do D-008 e bloqueie a conclusão/transição quando uma exigência obrigatória não estiver satisfeita, sem duplicar ownership de formulário, versão, respostas ou anexos.

## Fronteira

O D-012 pode persistir somente referências e evidências mínimas necessárias ao gate:
- `formId`;
- `formVersionId`;
- política da exigência;
- `submissionId`;
- status da submissão;
- tenant/correlation quando necessário ao runtime.

O D-012 **não** persiste respostas, schema do formulário, anexos ou revisões do D-008 e não consulta diretamente tabelas de Formulários fora de um adapter explícito.

## Políticas iniciais

- `optional`;
- `required_before_task_completion`;
- `required_before_transition`.

Submissões válidas para satisfazer exigência obrigatória:
- `submitted`;
- `corrected`.

`in_progress` não satisfaz exigência obrigatória.

## Microentregas

### H1 — Contrato puro da exigência
- schema Zod estrito de referência/política;
- evidência mínima de submissão;
- função pura de satisfação;
- sem banco, migration ou alteração de runtime.

### H2 — Validação da definição
- autorizar nó `form.d008`;
- exigir referência válida;
- congelar `formId`/`formVersionId` na versão publicada;
- impedir configuração ambígua.

### H3 — Gate da máquina de estados/tarefa
- impedir conclusão de tarefa/transição obrigatória sem evidência válida;
- preservar comportamento fail-closed;
- nenhuma leitura direta no banco D-008.

### H4 — Adapter/eventos/persistência
- consumir `form.submission.submitted.v1` e `form.submission.corrected.v1`;
- correlacionar somente com instância/etapa autorizada do mesmo tenant;
- persistir referência/status mínimo;
- replay idempotente.

### H5 — Hardening
- tenant A/B;
- form/version divergentes;
- submissão inexistente ou em progresso;
- correção;
- replay;
- regressão completa, segurança, TypeScript, testes, build e Docker.

## Gates

1. TDD RED → GREEN por microentrega.
2. Diff restrito ao D-012H.
3. Sem migration real, deploy, grants ou merge automático.
4. Checkpoint após cada GREEN relevante.
5. Integração em `main` somente com aprovação explícita.

## Status final — 2026-09-27

- H1 — GREEN — checkpoint `checkpoint/d012h-h1-green-20260927`
- H2 — GREEN — checkpoint `checkpoint/d012h-h2-green-20260927`
- H3 — GREEN — checkpoint `checkpoint/d012h-h3-green-20260927`
- H4 — GREEN — checkpoint `checkpoint/d012h-h4-green-20260927`
  - checkpoint intermediário: `checkpoint/d012h-h4-evidence-green-20260927`
- H5 — GREEN — checkpoint `checkpoint/d012h-h5-green-20260927`

### Evidências principais

- RED H1: ausência inicial de `workflowFormRequirement.ts`; Qualidade falhou somente na nova suíte enquanto 291 arquivos/1332 testes anteriores passaram.
- RED H5: 4 testes de hardening falharam como esperado, com 297 arquivos e 1361 testes anteriores passando.
- GREEN final: Qualidade, segurança, TypeScript, testes, build, empacotamento Docker, GIS visual, NEO external compatibility e NEO workspace visual homologation concluídos com sucesso no head `bcd44d5aa3852ea393bd52986dac9bb57c37be2e`.

### Resultado funcional

- `form.d008` referencia somente `formId`/`formVersionId` e política; schema, respostas, anexos e revisões continuam sob ownership do D-008.
- `required_before_task_completion` cria gate de tarefa humana e impede conclusão sem evidência válida.
- `required_before_transition` aguarda evento D-008, persiste evidência mínima e retoma somente a saída congelada do nó.
- `optional` não bloqueia o fluxo.
- eventos `submitted`/`corrected` exigem tenant, correlação, formulário e versão compatíveis.
- replay usa receipt persistente e evidência por `submissionId`; não troca submissão nem rebaixa `corrected` para `submitted`.
- nenhuma leitura direta de tabelas/repositórios internos do D-008 foi adicionada ao Workflow.
- nenhuma migration nova, deploy, grant ou merge automático foi executado.

