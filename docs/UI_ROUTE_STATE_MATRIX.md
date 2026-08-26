# Matriz de rotas e estados da interface

A matriz combina inspeção verificável de código, renderização do componente compartilhado `QueryState`, testes próprios de páginas, respostas HTTP, login real em navegador e capturas responsivas. **Implementado no componente** identifica o tratamento presente na tela, mas não implica que cada estado foi renderizado isoladamente no teste dessa página; **global** significa proteção pelo layout de sessão ou pelo `ErrorBoundary`; **não aplicável** indica telas de detalhe/formulário sem coleção vazia. O gerador falha se uma das 28 rotas, sua tela, seu teste declarado ou o fallback global estiver ausente.

| Rota | Tela | Navegação | Carregamento | Vazio | Erro | Evidência automatizada | Evidência visual |
|---|---|---|---|---|---|---|---|
| `/login` | `LoginPage.tsx` | direta: rota + fallback 404 | implementado no componente | não aplicável ao formulário ou detalhe | implementado no componente | contrato de rota + fonte idêntica | desktop+mobile |
| `/` | `Home.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | inspeção estrutural + QueryState renderizado | desktop+mobile |
| `/dashboards-relatorios` | `DashboardsReportsPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | inspeção estrutural + QueryState renderizado | desktop+mobile |
| `/ocorrencias` | `IncidentsPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | inspeção estrutural + QueryState renderizado | desktop+mobile |
| `/ocorrencias/:id` | `IncidentDetailPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | contrato de rota + fonte idêntica | HTTP 200 + fonte preservada |
| `/equipes` | `TeamsPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | inspeção estrutural + QueryState renderizado | desktop+mobile |
| `/kanban` | `KanbanPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | inspeção estrutural + QueryState renderizado | mobile |
| `/agente` | `AgentPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | inspeção estrutural + QueryState renderizado | desktop |
| `/viaturas` | `VehiclesPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | contrato de rota + fonte idêntica | HTTP 200 + fonte preservada |
| `/integracoes` | `IntegrationsPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | inspeção estrutural + QueryState renderizado | desktop+mobile |
| `/integracoes/workflows` | `WorkflowsPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | `client/src/pages/WorkflowBuilderPage.test.tsx` | HTTP 200 + fonte preservada |
| `/integracoes/workflows/:id` | `WorkflowBuilderPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | `client/src/pages/WorkflowBuilderPage.full.test.tsx` | HTTP 200 + fonte preservada |
| `/integracoes/execucoes` | `ExecutionsPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | `client/src/pages/ExecutionsPage.test.tsx` | HTTP 200 + fonte preservada |
| `/integracoes/conexoes` | `IntegrationResourcePages.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | `client/src/pages/IntegrationResourcePages.test.tsx` | HTTP 200 + fonte preservada |
| `/integracoes/webhooks` | `IntegrationResourcePages.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | `client/src/pages/IntegrationResourcePages.test.tsx` | HTTP 200 + fonte preservada |
| `/integracoes/credenciais` | `IntegrationResourcePages.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | `client/src/pages/IntegrationResourcePages.test.tsx` | HTTP 200 + fonte preservada |
| `/integracoes/logs` | `IntegrationResourcePages.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | `client/src/pages/IntegrationResourcePages.test.tsx` | HTTP 200 + fonte preservada |
| `/integracoes/revisoes-externas` | `ExternalIncidentReviewsPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | `client/src/pages/ExternalIncidentReviewsPage.test.tsx` | HTTP 200 + fonte preservada |
| `/integracoes/api-docs` | `ApiDocsPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | `client/src/pages/ApiDocsPage.test.tsx` | HTTP 200 + fonte preservada |
| `/manuais-ajuda` | `ManualsHelpPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | inspeção estrutural + QueryState renderizado | desktop+mobile |
| `/administracao` | `AdminPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | contrato de rota + fonte idêntica | HTTP 200 + fonte preservada |
| `/administracao/usuarios` | `UsersAccessPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | contrato de rota + fonte idêntica | HTTP 200 + fonte preservada |
| `/administracao/credenciais` | `LocalCredentialsPage.tsx` | direta: rota + fallback 404 | implementado no componente | não aplicável ao formulário ou detalhe | implementado no componente | contrato de rota + fonte idêntica | browser desktop+mobile autenticado |
| `/administracao/perfis` | `RolesPermissionsPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | contrato de rota + fonte idêntica | HTTP 200 + fonte preservada |
| `/administracao/escopos` | `AccessScopesPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | contrato de rota + fonte idêntica | HTTP 200 + fonte preservada |
| `/administracao/configuracoes` | `GeneralSettingsPage.tsx` | direta: rota + fallback 404 | implementado no componente | não aplicável ao formulário ou detalhe | implementado no componente | inspeção estrutural + QueryState renderizado | desktop+mobile |
| `/administracao/log-operacoes` | `OperationsLogPage.tsx` | direta: rota + fallback 404 | implementado no componente | implementado no componente | implementado no componente | `client/src/pages/OperationsLogPage.test.ts` | HTTP 200 + fonte preservada |
| `/404` | `NotFound.tsx` | direta: rota + fallback 404 | global: layout/sessão | não aplicável | global: ErrorBoundary | contrato de rota + fonte idêntica | HTTP 200 + fallback global |

## Totais

| Métrica | Resultado |
|---|---:|
| Rotas explícitas | 28 |
| Telas principais com validação estrutural dedicada | 9 |
| Rotas com captura desktop e/ou mobile | 11 |
| Rotas com carregamento implementado no componente | 27 |
| Rotas com vazio implementado no componente | 24 |
| Rotas com erro implementado no componente | 27 |
| Rotas sem fallback de erro | 0 |
