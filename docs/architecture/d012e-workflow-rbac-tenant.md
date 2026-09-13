# D-012E — RBAC e isolamento multi-tenant do Workflow

## Objetivo

Formalizar o isolamento por organização para definições, execuções e tarefas humanas do workflow sem criar um segundo mecanismo de autorização. A D-012E reutiliza o RBAC dinâmico existente e mantém o tenant como uma fronteira de autorização fail-closed.

## Invariantes

- cada workflow possui exatamente um escopo de organização em `workflow_tenant_scopes`;
- o tenant da execução é congelado no nascimento em `workflow_execution_tenant_scopes` e não é recalculado a partir do workflow pai;
- tarefas humanas herdam tenant exclusivamente pela execução; `workflow_tasks` não recebe `organization_id`;
- registros legados sem escopo inequívoco permanecem sem escopo e falham fechado;
- seleção de tenant nunca concede acesso por si só: o usuário precisa possuir assignment RBAC válido para a organização;
- permissões continuam no mecanismo dinâmico já existente; não há engine paralela de papéis/permissões;
- mutações de tarefa (`assign`, `claim`, `start`, `complete`) validam o tenant congelado antes de alterar estado;
- atribuição de responsável valida usuário ativo e assignment autorizado para o tenant.

## Persistência

A migration `0012_d012e_workflow_tenant_rbac.sql` é aditiva e cria:

1. `workflow_tenant_scopes` — propriedade organizacional da definição;
2. `workflow_execution_tenant_scopes` — propriedade organizacional congelada da execução;
3. `rbac_assignment_sources` — proveniência opcional para assignments gerenciados futuramente por uma fonte RBAC central.

O backfill de workflows ocorre somente quando o criador possui uma única organização inequívoca nos assignments ativos. Casos ambíguos não recebem fallback artificial.

## Proveniência RBAC central

A D-012E prepara apenas a fronteira de dados e contrato provider-neutral. Assignments locais permanecem sem linha em `rbac_assignment_sources`. Para assignments externos futuros, a tabela registra origem, identificadores externos, revisão da fonte, última sincronização e eventual revogação.

O contrato `CentralRbacProvider` contém somente validação de registros. Não existe nesta entrega integração de rede, sincronização, polling, webhook ou protocolo específico.

## Fluxo de autorização

### Workflow

1. resolver o tenant ativo já autorizado do usuário;
2. verificar a permissão dinâmica correspondente;
3. verificar `workflow_tenant_scopes`;
4. negar recursos sem escopo ou pertencentes a outra organização.

### Execução

1. validar o tenant do workflow na criação;
2. persistir `workflow_execution_tenant_scopes` na mesma transação da execução;
3. em transições posteriores, consultar o tenant congelado da execução;
4. negar ausência ou divergência de escopo.

### Tarefa humana

1. resolver `workflow_tasks.execution_id`;
2. consultar o tenant congelado da execução;
3. comparar com `organizationId` do contexto autorizado;
4. somente então bloquear a linha da tarefa e executar a transição de estado;
5. em `assign`, validar também o responsável no RBAC existente.

## Segurança

- fail-closed para tenant ausente, ambíguo ou divergente;
- nenhuma confiança em organization/tenant enviado pelo cliente como concessão de acesso;
- nenhuma duplicação de tenant em tarefas;
- nenhuma autorização baseada em nome de papel operacional;
- nenhuma integração externa ou credencial introduzida;
- auditoria e locks transacionais da D-012D permanecem preservados.

## Rollout

1. aplicar a migration somente em janela controlada e após backup/verificação do ambiente;
2. conferir quantidade de workflows e execuções que receberam backfill;
3. identificar registros legados não escopados e tratá-los administrativamente antes de uso;
4. validar permissões e tenants autorizados em ambiente de homologação;
5. habilitar a aplicação somente após os gates completos do repositório.

A criação desta documentação e da migration não autoriza aplicação em produção.

## Rollback

Antes de uso produtivo, rollback consiste em não aplicar a migration. Após aplicação, qualquer reversão deve ser operacionalmente planejada: os side tables são aditivos, mas não devem ser removidos enquanto código que exige o tenant congelado estiver ativo. O rollback seguro requer primeiro retornar a aplicação a uma versão compatível e somente depois avaliar a remoção das tabelas laterais.

## Fora do escopo

- sincronização com RBAC central;
- protocolos ou provedores externos;
- workflow compartilhado entre organizações;
- tenant próprio em `workflow_tasks`;
- D-012F eventos/gatilhos;
- condições no-code, SLA, designer, Kanban ou inbox visual;
- deploy ou aplicação automática de migration.
