import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appSource = fs.readFileSync(path.join(root, "client/src/App.tsx"), "utf8");
const outputPath = path.join(root, "docs/UI_ROUTE_STATE_MATRIX.md");

const routes = [
  ["/", "Home.tsx", "desktop+mobile", []],
  ["/dashboards-relatorios", "DashboardsReportsPage.tsx", "desktop+mobile", []],
  ["/ocorrencias", "IncidentsPage.tsx", "desktop+mobile", []],
  ["/ocorrencias/:id", "IncidentDetailPage.tsx", "HTTP 200 + fonte preservada", []],
  ["/equipes", "TeamsPage.tsx", "desktop+mobile", []],
  ["/kanban", "KanbanPage.tsx", "mobile", []],
  ["/agente", "AgentPage.tsx", "desktop", ["client/src/pages/AgentPage.test.tsx"]],
  ["/viaturas", "VehiclesPage.tsx", "HTTP 200 + fonte preservada", []],
  ["/integracoes", "IntegrationsPage.tsx", "desktop+mobile", []],
  ["/integracoes/workflows", "WorkflowsPage.tsx", "HTTP 200 + fonte preservada", ["client/src/pages/WorkflowBuilderPage.test.tsx"]],
  ["/integracoes/workflows/:id", "WorkflowBuilderPage.tsx", "HTTP 200 + fonte preservada", ["client/src/pages/WorkflowBuilderPage.full.test.tsx"]],
  ["/integracoes/execucoes", "ExecutionsPage.tsx", "HTTP 200 + fonte preservada", ["client/src/pages/ExecutionsPage.test.tsx"]],
  ["/integracoes/conexoes", "IntegrationResourcePages.tsx", "HTTP 200 + fonte preservada", ["client/src/pages/IntegrationResourcePages.test.tsx"]],
  ["/integracoes/webhooks", "IntegrationResourcePages.tsx", "HTTP 200 + fonte preservada", ["client/src/pages/IntegrationResourcePages.test.tsx"]],
  ["/integracoes/credenciais", "IntegrationResourcePages.tsx", "HTTP 200 + fonte preservada", ["client/src/pages/IntegrationResourcePages.test.tsx"]],
  ["/integracoes/logs", "IntegrationResourcePages.tsx", "HTTP 200 + fonte preservada", ["client/src/pages/IntegrationResourcePages.test.tsx"]],
  ["/integracoes/revisoes-externas", "ExternalIncidentReviewsPage.tsx", "HTTP 200 + fonte preservada", ["client/src/pages/ExternalIncidentReviewsPage.test.tsx"]],
  ["/integracoes/api-docs", "ApiDocsPage.tsx", "HTTP 200 + fonte preservada", ["client/src/pages/ApiDocsPage.test.tsx"]],
  ["/manuais-ajuda", "ManualsHelpPage.tsx", "desktop+mobile", ["client/src/pages/ManualsHelpPage.test.tsx"]],
  ["/administracao", "AdminPage.tsx", "HTTP 200 + fonte preservada", []],
  ["/administracao/usuarios", "UsersAccessPage.tsx", "HTTP 200 + fonte preservada", []],
  ["/administracao/perfis", "RolesPermissionsPage.tsx", "HTTP 200 + fonte preservada", []],
  ["/administracao/escopos", "AccessScopesPage.tsx", "HTTP 200 + fonte preservada", []],
  ["/administracao/configuracoes", "GeneralSettingsPage.tsx", "desktop+mobile", ["client/src/pages/GeneralSettingsPage.test.tsx"]],
  ["/administracao/log-operacoes", "OperationsLogPage.tsx", "HTTP 200 + fonte preservada", ["client/src/pages/OperationsLogPage.test.ts"]],
  ["/404", "NotFound.tsx", "HTTP 200 + fallback global", []],
];

const primaryPages = new Set(["Home.tsx", "DashboardsReportsPage.tsx", "IncidentsPage.tsx", "TeamsPage.tsx", "KanbanPage.tsx", "AgentPage.tsx", "IntegrationsPage.tsx", "GeneralSettingsPage.tsx", "ManualsHelpPage.tsx"]);
const loadingPattern = /isLoading|isFetching|isPending|QueryState|loading/;
const emptyPattern = /Nenhum|Nenhuma|Ainda não|Sem ocorr|length === 0|!.*length/;
const errorPattern = /\.error|isError|role="alert"|QueryState|error=/;

const rows = routes.map(([route, page, visual, tests]) => {
  const routeDeclaration = `path={"${route}"}`;
  if (!appSource.includes(routeDeclaration)) throw new Error(`Rota ausente em App.tsx: ${route}`);
  const sourcePath = path.join(root, "client/src/pages", page);
  if (!fs.existsSync(sourcePath)) throw new Error(`Tela ausente para ${route}: ${page}`);
  for (const test of tests) if (!fs.existsSync(path.join(root, test))) throw new Error(`Teste de tela ausente: ${test}`);

  const source = fs.readFileSync(sourcePath, "utf8");
  const primary = primaryPages.has(page);
  return {
    route,
    page,
    navigation: "direta: rota + fallback 404",
    loading: loadingPattern.test(source) ? "implementado no componente" : "global: layout/sessão",
    empty: emptyPattern.test(source) ? "implementado no componente" : page === "NotFound.tsx" ? "não aplicável" : "não aplicável ao formulário ou detalhe",
    error: errorPattern.test(source) ? "implementado no componente" : "global: ErrorBoundary",
    tests: primary ? "inspeção estrutural + QueryState renderizado" : tests.length ? tests.map(test => `\`${test}\``).join("<br>") : "contrato de rota + fonte idêntica",
    visual,
  };
});

if (rows.length !== 26) throw new Error(`Matriz incompleta: ${rows.length} rotas; eram esperadas 26.`);
if (!appSource.includes("<Route component={NotFound} />")) throw new Error("Fallback global 404 ausente.");
if (!appSource.includes("<ErrorBoundary>")) throw new Error("ErrorBoundary global ausente.");

const markdown = `# Matriz de rotas e estados da interface\n\nA matriz combina inspeção verificável de código, renderização do componente compartilhado \`QueryState\`, testes próprios de páginas, respostas HTTP e capturas responsivas. **Implementado no componente** identifica o tratamento presente na tela, mas não implica que cada estado foi renderizado isoladamente no teste dessa página; **global** significa proteção pelo layout de sessão ou pelo \`ErrorBoundary\`; **não aplicável** indica telas de detalhe/formulário sem coleção vazia. O gerador falha se uma das 26 rotas, sua tela, seu teste declarado ou o fallback global estiver ausente.\n\n| Rota | Tela | Navegação | Carregamento | Vazio | Erro | Evidência automatizada | Evidência visual |\n|---|---|---|---|---|---|---|---|\n${rows.map(row => `| \`${row.route}\` | \`${row.page}\` | ${row.navigation} | ${row.loading} | ${row.empty} | ${row.error} | ${row.tests} | ${row.visual} |`).join("\n")}\n\n## Totais\n\n| Métrica | Resultado |\n|---|---:|\n| Rotas explícitas | ${rows.length} |\n| Telas principais com validação estrutural dedicada | ${rows.filter(row => primaryPages.has(row.page)).length} |\n| Rotas com captura desktop e/ou mobile | ${rows.filter(row => !row.visual.startsWith("HTTP 200")).length} |\n| Rotas com carregamento implementado no componente | ${rows.filter(row => row.loading.startsWith("implementado")).length} |\n| Rotas com vazio implementado no componente | ${rows.filter(row => row.empty.startsWith("implementado")).length} |\n| Rotas com erro implementado no componente | ${rows.filter(row => row.error.startsWith("implementado")).length} |\n| Rotas sem fallback de erro | 0 |\n`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, markdown);
console.log(`Matriz UI gerada: ${rows.length} rotas em ${outputPath}`);
