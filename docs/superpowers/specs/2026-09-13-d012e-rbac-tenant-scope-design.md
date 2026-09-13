# D-012E — RBAC e isolamento multi-tenant formal

## Contexto

A D-012D integrou tarefas humanas à engine stateful de workflow. O sistema já possui RBAC dinâmico (`access_roles`, `access_permissions`, `role_permissions`, `user_role_assignments`) e seleção explícita de organização ativa por `x-organization-id`. O núcleo operacional já protege ocorrências, equipes e viaturas por tenant, porém workflows, execuções e tarefas ainda não possuem vínculo formal e imutável com uma organização.

A D-012E fecha essa lacuna sem criar um segundo mecanismo de autorização e prepara a plataforma para, no futuro, receber dados de RBAC de uma fonte central corporativa.

## Decisão arquitetural

Adotar escopo de tenant por tabelas dedicadas, seguindo o padrão operacional já existente.

- `workflow_tenant_scopes`: vincula cada workflow a exatamente uma organização.
- `workflow_execution_tenant_scopes`: congela a organização da execução no momento em que a instância nasce.
- `workflow_tasks` não recebe `organization_id` duplicado; a tarefa herda obrigatoriamente o tenant de sua execução.
- Um workflow não será global nem compartilhado por múltiplas organizações nesta etapa.
- Conhecer um `workflowId`, `executionId` ou `taskId` não concede acesso. Toda operação deve resolver autorização e tenant antes de carregar ou mutar o recurso.

## Ordem obrigatória de autorização

Toda operação de workflow deverá seguir a sequência fail-closed:

1. usuário autenticado e ativo;
2. permissão RBAC requerida;
3. tenant ativo resolvido e autorizado para o usuário;
4. recurso pertencente ao tenant ativo;
5. restrições específicas da operação e do estado do recurso;
6. mutação e auditoria.

Nenhuma função pública do módulo de workflow poderá fazer lookup apenas por ID e mutar o registro sem validar o tenant congelado.

## Permissões mínimas

A D-012E adicionará ao catálogo existente, sem criar outro RBAC:

- `workflows.view`
- `workflows.edit`
- `workflows.publish`
- `workflows.execute`
- `workflow_tasks.view`
- `workflow_tasks.assign`
- `workflow_tasks.act`

Papéis continuam sendo compostos por permissões. A D-012E não introduz lógica nova baseada em nome de papel dentro da engine. Exceções administrativas existentes continuam passando pelo mecanismo central já existente (`assertPermission`, `getAccessSnapshot`, Super Administrador/owner quando aplicável).

## Workflows tenant-aware

Criação de workflow exige tenant ativo. O vínculo em `workflow_tenant_scopes` é criado na mesma transação lógica do workflow.

Leitura, edição, publicação, ativação e arquivamento filtram por tenant. Um workflow não pode ser movido de organização por uma operação comum. Eventual transferência administrativa de tenant fica fora deste corte.

Workflows legados só recebem backfill automático quando a organização puder ser determinada de forma inequívoca. Registros ambíguos permanecem sem escopo e, por consequência, fail-closed para operações tenant-aware até regularização administrativa.

## Execuções e congelamento do tenant

Ao iniciar uma instância:

- a engine resolve o tenant do workflow;
- valida que ele coincide com o tenant ativo;
- cria a execução;
- persiste `workflow_execution_tenant_scopes` na mesma transação;
- a partir desse ponto, a execução nunca recalcula tenant a partir do workflow pai.

Isso preserva histórico e evita que mudanças futuras no cadastro do workflow alterem o tenant de execuções já existentes.

Retry, cancelamento, avanço, retomada e consulta de execução usam o tenant congelado da execução.

## Tarefas e responsáveis

Tarefas herdam tenant exclusivamente pela execução.

Atribuição e reatribuição validam que o usuário destino possui acesso à mesma organização da execução. Nesta etapa, a checagem mínima é pertença/autorização ao tenant; regras mais granulares de capacidade operacional podem evoluir depois sem alterar o vínculo de tenant.

`claim`, `start` e `complete` exigem:

- `workflow_tasks.act`;
- tenant ativo igual ao tenant congelado da execução;
- tarefa atribuída ao ator ou claim permitido conforme o estado atual;
- invariantes da máquina de estados D-012D.

A D-012E não altera a regra de que criação de tarefa pertence à engine e cancelamento isolado não é API pública.

## Evolução para RBAC central

O enforcement continuará local ao Despacho para não acoplar a execução operacional à disponibilidade de um serviço externo.

A arquitetura será preparada com uma fronteira de origem de autorização, separando três conceitos:

- **enforcement local**: decisões de acesso continuam consultando o modelo materializado local (`access_roles`, permissões e assignments);
- **proveniência**: assignments poderão registrar origem, identificador estável da fonte e versão/revisão de sincronização;
- **ingestão futura**: um adaptador poderá receber snapshots ou deltas de um RBAC central e materializá-los localmente de forma idempotente.

A engine de workflow não conhecerá REST, SCIM, OIDC, LDAP ou qualquer fornecedor específico. Protocolos concretos ficam atrás de um adaptador futuro, por exemplo `CentralRbacProvider`/`RbacAssignmentSource`.

### Contrato interno de origem

A fronteira futura deverá normalizar qualquer fonte para um contrato interno equivalente a:

- `sourceKind`: `local` ou `external`;
- `sourceSystem`: identificador lógico do RBAC central quando externo;
- `externalSubjectId`: identificador estável do usuário/subject na fonte;
- `externalAssignmentId`: identificador estável do vínculo, quando fornecido;
- `organizationId` ou chave externa de tenant resolvível localmente;
- papéis e/ou permissões;
- escopo organizacional;
- `sourceRevision` ou cursor equivalente;
- validade/expiração quando fornecida;
- estado ativo/revogado;
- instante da última sincronização validada.

Esses campos representam o contrato arquitetural. A implementação física poderá usar colunas nullable em assignments existentes ou uma tabela de proveniência dedicada, escolhendo a alternativa de menor risco durante o plano técnico, sem alterar a semântica acima.

### Autoridade e coexistência

Assignments locais e externos poderão coexistir, mas não serão indistinguíveis.

- Um assignment com `sourceKind=external` é administrado pela respectiva fonte externa e não deve ser editado manualmente como se fosse local.
- Uma sincronização completa e validada de uma fonte é autoritativa somente sobre os assignments externos pertencentes àquela fonte/subject/tenant.
- Em um snapshot completo, assignments externos anteriormente materializados e ausentes no novo snapshot são revogados/inativados atomicamente após a validação integral do snapshot.
- Assignments locais não são apagados por uma sincronização externa.
- A permissão efetiva continua sendo calculada sobre assignments ativos válidos, independentemente da origem, respeitando a política local de coexistência.
- Revogação explícita recebida da fonte externa tem precedência sobre a cópia externa local correspondente.

Isso evita que a indisponibilidade da fonte central transforme o sistema em fail-open e evita também que uma revogação central seja ignorada indefinidamente.

### Indisponibilidade e consistência

A D-012E não implementará integração externa nem polling. Quando a integração central existir:

- perda temporária da fonte não apaga automaticamente o último snapshot validado;
- expiração fornecida pela fonte continua sendo respeitada localmente;
- snapshots/deltas inválidos não substituem o estado efetivo anterior;
- atualização parcial não se torna efetiva como se fosse uma revisão completa;
- a política operacional poderá definir TTL máximo para dados externos sem exigir mudança na engine de workflow.

## Segurança e fail-closed

- Header de tenant nunca é aceito como autorização; ele apenas seleciona um tenant dentre os já autorizados.
- Recurso sem escopo de tenant não é global por padrão.
- Backfill nunca usa organização fixa ou fallback arbitrário.
- Assignee de outro tenant é rejeitado.
- Execução sem `workflow_execution_tenant_scopes` não pode ser avançada por API tenant-aware.
- Dados de RBAC central futuros não serão aplicados parcialmente: uma revisão de sincronização deve ser validada antes de se tornar efetiva.
- Perda temporária da fonte RBAC central não cria permissões novas nem altera o tenant ativo por conta própria.

## Auditoria

Eventos de workflow e tarefa manterão o ator e `correlationId` atuais e passarão a incluir ou permitir reconstruir o `organizationId` do recurso.

Eventos futuros de sincronização RBAC deverão registrar fonte, revisão, quantidade de alterações, resultado e falhas sem armazenar segredos do provedor.

## Migration e compatibilidade

A migration será aditiva e versionada.

Ela criará as tabelas de escopo e índices necessários. O backfill de workflows será feito somente por regras determinísticas comprováveis a partir de dados existentes. Execuções poderão herdar tenant apenas quando o workflow correspondente já tiver tenant inequívoco; caso contrário permanecem sem escopo e bloqueadas nas rotas tenant-aware.

Não haverá alteração destrutiva nas tabelas centrais de workflow nesta etapa.

A preparação de proveniência do RBAC central também deverá ser aditiva. Nenhum assignment local existente será reinterpretado retroativamente como externo.

## Microentregas

1. **D-012E1 — contrato RBAC/tenant**: testes de arquitetura, catálogo de permissões e helpers de autorização.
2. **D-012E2 — persistência de escopo**: schemas, migration, journal e backfill fail-closed.
3. **D-012E3 — workflows tenant-aware**: criação, leitura, edição, publicação e ativação.
4. **D-012E4 — execução congelada por tenant**: start/advance/resume/cancel/retry protegidos.
5. **D-012E5 — tarefas e assignee**: listagem/mutação protegidas e bloqueio cross-tenant.
6. **D-012E6 — preparação RBAC central**: contrato interno de origem, metadados/proveniência e invariantes de autoridade, sem integração externa.
7. **D-012E7 — hardening**: regressão, auditoria, documentação, CI e PR.

## Fora de escopo

- integração real com RBAC central;
- SCIM/OIDC/LDAP específicos;
- eventos externos/gatilhos produtivos D-012F;
- workflow compartilhado entre múltiplos tenants;
- nova UI de administração de RBAC;
- SLA, notificações ou escalonamento de tarefas;
- deploy produtivo ou aplicação automática de migration.

## Critérios de aceite

- nenhuma operação de workflow/tarefa tenant-aware cruza organizações;
- tenant da execução é congelado na criação;
- assignee cross-tenant é rejeitado;
- permissões são avaliadas pelo RBAC existente, não por um segundo mapa de papéis;
- recursos sem tenant não ganham acesso implícito;
- migration e backfill são aditivos e determinísticos;
- assignments externos têm proveniência inequívoca e não são confundidos com assignments locais;
- o contrato prevê revogação/snapshot central sem dependência online da engine;
- arquitetura permite ingestão futura de RBAC central sem alterar a engine de workflow;
- testes de regressão, TypeScript, build, Docker e gates de compatibilidade permanecem verdes;
- merge continua sujeito a autorização explícita separada do proprietário do projeto.
