# D-012D — Tarefas e Responsáveis — Implementation Plan

**Goal:** tornar o workflow stateful da D-012C utilizável para trabalho humano, com `WorkflowTask`, atribuição por usuário/equipe/papel, claim/start/complete, concorrência serializada e histórico auditável, sem antecipar RBAC/multi-tenant formal, eventos externos ou UI/Kanban.

**Base:** `feat/d012c-workflow-instance-engine` @ `3b0c106aad52c6460e66aefd44b673019a4a0ab2` (gates GREEN). Integração em `main` continua dependente dos PRs anteriores e de aprovação explícita.

## Decisões

- Novo tipo de nó: `task.human`.
- Ao entrar em `task.human`, a instância fica `waiting` e uma única tarefa aberta é criada na mesma transação.
- Atribuição é exatamente uma entre `user`, `team` ou `role`.
- `user`: somente o usuário configurado pode fazer claim.
- `team`: usuário ativo deve pertencer à equipe configurada (`users.teamId`).
- `role`: usuário ativo deve possuir o `operationalRole` configurado.
- D-012E acrescentará isolamento formal por tenant/organização e permissões específicas; D-012D não aceita tenant arbitrário do cliente.
- Claim/start/complete usam lock transacional da linha da tarefa (`FOR UPDATE`) para impedir dupla apropriação/dupla conclusão.
- Estados de tarefa: `open`, `in_progress`, `completed`, `cancelled`.
- `claim` mantém `open` e preenche `claimedByUserId/claimedAt`; `start` muda para `in_progress`; `complete` exige o mesmo claimant, conclui a tarefa e avança a instância atomicamente.
- Se a tarefa tiver uma única saída, `complete` avança automaticamente. Se tiver múltiplas saídas, `targetNodeId` é obrigatório e deve corresponder a uma aresta válida. Se não houver saída, a instância é concluída.
- Nenhuma tarefa faz HTTP, SQL configurável, shell, integração externa ou escrita em `incidents`.
- Histórico persistente em `workflow_task_events` e auditoria espelhada em `audit_logs`.

## Persistência

Criar `server/workflow/workflowTaskSchema.ts` e migration `drizzle/0011_d012d_workflow_tasks.sql`:

- `workflow_tasks`: `id`, `execution_id`, `node_id`, `status`, `assignment_type`, `assignee_user_id`, `assignee_team_id`, `assignee_role`, `claimed_by_user_id`, `correlation_id`, `claimed_at`, `started_at`, `completed_at`, `cancelled_at`, `created_at`, `updated_at`.
- unique `(execution_id,node_id)` para impedir tarefa duplicada da mesma etapa.
- índices por `status`, usuário/equipe/papel e execução.
- `workflow_task_events`: `task_id`, `action`, `actor_user_id`, `before_data`, `after_data`, `correlation_id`, `created_at`.

## Microetapas

### D1 — Domínio e schema
- RED para parsing de `task.human`, atribuição exclusiva e estado `waiting` ao entrar no nó.
- Criar `workflowTaskDomain.ts` e `workflowTaskSchema.ts`.
- Migration aditiva 0011 + journal.

### D2 — Claim/start e concorrência
- RED para elegibilidade user/team/role, claim único e start pelo claimant.
- Criar `workflowTaskPersistence.ts` com row lock, histórico e audit log na mesma transação.

### D3 — Complete + avanço da instância
- RED para conclusão atômica, zero/uma/múltiplas saídas, bloqueio de usuário diferente e criação automática da próxima tarefa humana.
- Integrar com a state machine D-012C sem duplicar engine.

### D4 — Hardening e documentação
- Teste arquitetural: sem `incidents`, sem HTTP, sem segunda engine, sem tenant vindo do payload.
- Documentar rollout/rollback e limites até D-012E/K.
- Gates finais: security, TypeScript, suíte completa, build, Docker, NEO/GIS.

## Gates

TDD RED → GREEN por microetapa. Migration somente versionada, sem aplicação/deploy. PR fica Draft enquanto dependências anteriores não estiverem integradas. Merge em `main` somente com aprovação explícita.
