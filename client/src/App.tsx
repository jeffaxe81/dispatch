import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { useAuth } from "@/_core/hooks/useAuth";
import { isFieldAgent } from "@/lib/operationalAccess";
import { trpc } from "@/lib/trpc";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Code splitting: mobile downloads a route only when it opens it.
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const AccessScopesPage = lazy(() => import("@/pages/AccessScopesPage"));
const IncidentsPage = lazy(() => import("@/pages/IncidentsPage"));
const KanbanPage = lazy(() => import("@/pages/KanbanPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const TeamsPage = lazy(() => import("@/pages/TeamsPage"));
const UsersAccessPage = lazy(() => import("@/pages/UsersAccessPage"));
const LocalCredentialsPage = lazy(() => import("@/pages/LocalCredentialsPage"));
const VehiclesPage = lazy(() => import("@/pages/VehiclesPage"));
const RolesPermissionsPage = lazy(() => import("@/pages/RolesPermissionsPage"));
const GeneralSettingsPage = lazy(() => import("@/pages/GeneralSettingsPage"));
const OperationsLogPage = lazy(() => import("@/pages/OperationsLogPage"));
const IntegrationsPage = lazy(() => import("@/pages/IntegrationsPage"));
const EmbeddedApplicationsPage = lazy(() => import("@/pages/EmbeddedApplicationsPage"));
const WorkflowsPage = lazy(() => import("@/pages/WorkflowsPage"));
const WorkflowBuilderPage = lazy(() => import("@/pages/WorkflowBuilderPage"));
const ExecutionsPage = lazy(() => import("@/pages/ExecutionsPage"));
const ExternalIncidentReviewsPage = lazy(() => import("@/pages/ExternalIncidentReviewsPage"));
const ApiDocsPage = lazy(() => import("@/pages/ApiDocsPage"));
const DashboardsReportsPage = lazy(() => import("@/pages/DashboardsReportsPage"));
const WorkShiftOperations = lazy(() => import("@/pages/WorkShiftOperations"));
const ManualsHelpPage = lazy(() => import("@/pages/ManualsHelpPage"));
const FormsPage = lazy(() => import("@/pages/FormsPage"));
const FormDesignerPage = lazy(() => import("@/pages/FormDesignerPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const WorkspaceExternalScreenPage = lazy(() => import("@/pages/WorkspaceExternalScreenPage"));
const Home = lazy(() => import("./pages/Home"));
const AgentWithFormsPage = lazy(() => import("@/pages/OperationalFormsRoutes").then(module => ({ default: module.AgentWithFormsPage })));
const IncidentDetailWithFormsPage = lazy(() => import("@/pages/OperationalFormsRoutes").then(module => ({ default: module.IncidentDetailWithFormsPage })));
const ConnectionsPage = lazy(() => import("@/pages/IntegrationResourcePages").then(module => ({ default: module.ConnectionsPage })));
const CredentialsPage = lazy(() => import("@/pages/IntegrationResourcePages").then(module => ({ default: module.CredentialsPage })));
const IntegrationLogsPage = lazy(() => import("@/pages/IntegrationResourcePages").then(module => ({ default: module.IntegrationLogsPage })));
const WebhooksPage = lazy(() => import("@/pages/IntegrationResourcePages").then(module => ({ default: module.WebhooksPage })));

function FieldRestrictedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const access = trpc.access.me.useQuery(undefined, { retry: false });
  if (loading || access.isLoading) return null;
  if (isFieldAgent(user?.operationalRole, access.data?.assignments)) return <Redirect to="/agente" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={LoginPage} />
      <Route path={"/workspace/external"} component={WorkspaceExternalScreenPage} />
      <Route path={"/"} component={() => <FieldRestrictedRoute component={Home} />} />
      <Route path={"/dashboards-relatorios"} component={() => <FieldRestrictedRoute component={DashboardsReportsPage} />} />
      <Route path={"/operacao-jornada"} component={() => <FieldRestrictedRoute component={WorkShiftOperations} />} />
      <Route path={"/formularios"} component={() => <FieldRestrictedRoute component={FormsPage} />} />
      <Route path={"/formularios/:id"} component={() => <FieldRestrictedRoute component={FormDesignerPage} />} />
      <Route path={"/ocorrencias"} component={IncidentsPage} />
      <Route path={"/ocorrencias/:id"} component={IncidentDetailWithFormsPage} />
      <Route path={"/equipes"} component={TeamsPage} />
      <Route path={"/kanban"} component={() => <FieldRestrictedRoute component={KanbanPage} />} />
      <Route path={"/agente"} component={AgentWithFormsPage} />
      <Route path={"/viaturas"} component={VehiclesPage} />
      <Route path={"/integracoes"} component={IntegrationsPage} />
      <Route path={"/integracoes/aplicacoes-incorporadas"} component={EmbeddedApplicationsPage} />
      <Route path={"/integracoes/workflows"} component={WorkflowsPage} />
      <Route path={"/integracoes/workflows/:id"} component={WorkflowBuilderPage} />
      <Route path={"/integracoes/execucoes"} component={ExecutionsPage} />
      <Route path={"/integracoes/conexoes"} component={ConnectionsPage} />
      <Route path={"/integracoes/webhooks"} component={WebhooksPage} />
      <Route path={"/integracoes/credenciais"} component={CredentialsPage} />
      <Route path={"/integracoes/logs"} component={IntegrationLogsPage} />
      <Route path={"/integracoes/revisoes-externas"} component={ExternalIncidentReviewsPage} />
      <Route path={"/integracoes/api-docs"} component={ApiDocsPage} />
      <Route path={"/manuais-ajuda"} component={ManualsHelpPage} />
      <Route path={"/administracao"} component={AdminPage} />
      <Route path={"/administracao/usuarios"} component={UsersAccessPage} />
      <Route path={"/administracao/credenciais"} component={LocalCredentialsPage} />
      <Route path={"/administracao/perfis"} component={RolesPermissionsPage} />
      <Route path={"/administracao/escopos"} component={AccessScopesPage} />
      <Route path={"/administracao/configuracoes"} component={GeneralSettingsPage} />
      <Route path={"/administracao/log-operacoes"} component={OperationsLogPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Suspense fallback={<div role="status" className="mx-auto mt-10 w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">Carregando módulo do AXE Despacho...</div>}>
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
