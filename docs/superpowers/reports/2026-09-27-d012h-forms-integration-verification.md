# D-012H — Integração Workflow + Formulários D-008 — Relatório de Verificação

Data: 2026-09-27  
Branch: `feat/d012h-forms-integration`  
PR: #115  
Base: `main@ba9438a3441204ab96415950c2dbed0f3fd6a0de`

## Escopo verificado

A D-012H conecta Workflow e Formulários D-008 por referência e eventos versionados, mantendo o D-008 como proprietário do schema, respostas, anexos e revisões.

Foram entregues:

1. contrato estrito de exigência de formulário;
2. validação/publicação do nó `form.d008`;
3. gates de tarefa e transição;
4. adaptação dos eventos `form.submission.submitted.v1` e `form.submission.corrected.v1`;
5. persistência somente da evidência mínima por nó;
6. correlação por tenant + `correlationId` + `formId/formVersionId`;
7. retomada segura de `required_before_transition`;
8. tarefa humana implícita em `required_before_task_completion`;
9. idempotência/replay via receipt persistente e `submissionId`;
10. hardening contra troca de submissão e downgrade `corrected → submitted`.

## TDD

### H1

RED registrado no commit `7d474895ad1e8808be13b4fa0c27cfce2324ab40`.

A execução de Qualidade falhou somente pela ausência inicial de `workflowFormRequirement.ts`, enquanto 291 arquivos e 1332 testes anteriores passaram.

GREEN no commit `358b12575fecc9c032e91f6f63db557fcfe6e74e`.

### H5

RED registrado no commit `42bcef9ac9909a849aaf360c2cf11f1c5df44ae9`.

Resultado esperado:
- 1 arquivo de teste falhou;
- 4 testes novos falharam;
- 297 arquivos passaram;
- 1361 testes anteriores passaram.

As falhas cobriam:
- receipt não consultado no replay;
- receipt não concluído após persistência;
- troca indevida de `submissionId`;
- downgrade de `corrected` para `submitted`.

GREEN funcional final no commit `bcd44d5aa3852ea393bd52986dac9bb57c37be2e`.

## Gates GREEN no head funcional

- Security regression: PASS
- TypeScript: PASS
- Testes: PASS
- Build: PASS
- Docker packaging: PASS
- GIS visual homologation: PASS
- NEO external compatibility: PASS
- NEO workspace visual homologation: PASS

## Checkpoints

- `checkpoint/pre-d012h-forms-integration-20260927`
- `checkpoint/d012h-h1-green-20260927`
- `checkpoint/d012h-h2-green-20260927`
- `checkpoint/d012h-h3-green-20260927`
- `checkpoint/d012h-h4-evidence-green-20260927`
- `checkpoint/d012h-h4-green-20260927`
- `checkpoint/d012h-h5-green-20260927`

## Fronteira e segurança

- O Workflow não armazena respostas do formulário.
- O Workflow não armazena schema D-008, anexos ou revisões.
- O runtime D-012H não importa `formsSchema`, `formRepository` ou acesso direto ao banco interno do D-008.
- Eventos incompatíveis com tenant/correlação/form/version não satisfazem a exigência.
- Uma etapa já vinculada não aceita outra submissão.
- Evento atrasado `submitted` não rebaixa evidência `corrected`.
- Replay é bloqueado por receipt persistente mesmo depois do avanço da instância.
- Não foi criada migration D-012H.
- Não houve deploy, grant produtivo ou merge automático.

## Gate de integração

PR #115 permanece Draft. Integração em `main` exige aprovação explícita do responsável pelo projeto.
