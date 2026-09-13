# D-012C — Engine de Instâncias

A D-012C reutiliza `workflow_executions` como persistência da instância e não cria uma segunda engine.

Cada instância manual fica vinculada ao `workflowVersionId` publicado no momento do início. Avanços posteriores usam essa mesma versão, mesmo quando o workflow recebe novas edições ou publicações.

A máquina de estados fica em `server/workflow/workflowInstanceStateMachine.ts` e a persistência transacional em `server/workflow/workflowInstancePersistence.ts`.

A entrega permanece em modo `simulacao`, sem efeitos externos. As transições registram ator, origem, destino, horário e `correlationId`.

A D-012C cobre início manual, avanço por aresta válida, conclusão e cancelamento. Tarefas, RBAC multi-tenant, eventos externos e gatilhos permanecem para as próximas microentregas.

A integração depende dos gates de CI, do relatório de verificação, da integração prévia da D-012B e da aprovação explícita do responsável pelo projeto.
