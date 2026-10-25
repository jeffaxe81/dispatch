# D-012I — Prazos, SLA e Escalonamento Seguro — Implementation Plan

**Base empilhada:** `feat/d012h-forms-integration@799790687c18535dcc7772072656d5a07492bcd3`
**Branch:** `feat/d012i-sla-deadlines`
**Checkpoint pré-implementação:** `checkpoint/pre-d012i-sla-20260927`

## Objetivo

Adicionar controle temporal a tarefas/etapas do Workflow sem permitir alteração automática de estado crítico da Ocorrência.

A D-012I deverá:
- calcular prazo de tarefa/etapa a partir de configuração publicada;
- indicar estado temporal `on_time`, `due_soon` e `overdue`;
- emitir eventos/lembretes idempotentes;
- produzir intenção de escalonamento segura;
- preservar tenant, `correlationId` e versão congelada;
- não executar mutação direta no domínio de Ocorrência.

## Contrato inicial

Configuração SLA por nó:
- `dueInMinutes`: inteiro positivo;
- `reminderBeforeMinutes`: inteiro >= 0 e menor que `dueInMinutes`;
- `escalationAfterMinutes`: inteiro >= 0 após o vencimento;
- `escalationMode`: `notify_only` ou `reassign_task`.

Limites iniciais:
- prazo máximo: 525600 minutos (365 dias);
- sem expressões, scripts ou datas arbitrárias no designer;
- datas runtime em ISO-8601 UTC.

## Microentregas

### I1 — Contrato temporal puro
- schema Zod;
- cálculo de `dueAt`, `reminderAt` e `escalationAt`;
- avaliação `on_time` / `due_soon` / `overdue`;
- intenção de escalonamento sem efeito externo.

### I2 — Validação da definição
- aceitar `sla` somente em nós elegíveis;
- congelar configuração publicada;
- rejeitar combinações ambíguas/inválidas.

### I3 — Persistência temporal da tarefa
- persistir timestamps derivados;
- sem recalcular por definição nova;
- manter versão congelada;
- migration apenas versionada/documentada, sem aplicação produtiva automática.

### I4 — Eventos e scheduler seguro
- eventos versionados de lembrete/vencimento;
- idempotência por task/event kind;
- processamento tenant-aware;
- escalonamento como intenção controlada.

### I5 — Hardening
- replay;
- concorrência;
- clock boundary;
- tarefa concluída/cancelada não dispara SLA;
- tenant A/B;
- regressão, segurança, TypeScript, testes, build e Docker.

## Gates

1. TDD RED → GREEN por microentrega.
2. Diff restrito à D-012I.
3. Sem deploy, grants ou alteração automática de estado crítico da ocorrência.
4. Checkpoint após GREEN.
5. Integração em `main` somente após D-012H estar integrada e com aprovação explícita.
