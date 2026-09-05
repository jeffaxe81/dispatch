import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminPage from "@/pages/AdminPage";
import AccessScopesPage from "@/pages/AccessScopesPage";
import AgentPage from "@/pages/AgentPage";
import IncidentDetailPage from "@/pages/IncidentDetailPage";
import IncidentsPage from "@/pages/IncidentsPage";
import KanbanPage from "@/pages/KanbanPage";
import NotFound from "@/pages/NotFound";
import TeamsPage from "@/pages/TeamsPage";
import UsersAccessPage from "@/pages/UsersAccessPage";
import LocalCredentialsPage from "@/pages/LocalCredentialsPage";
import VehiclesPage from "@/pages/VehiclesPage";
import RolesPermissionsPage from "@/pages/RolesPermissionsPage";
import GeneralSettingsPage from "@/pages/GeneralSettingsPage";
import OperationsLogPage from "@/pages/OperationsLogPage";
import IntegrationsPage from "@/pages/IntegrationsPage";
import EmbeddedApplicationsPage from "@/pages/EmbeddedApplicationsPage";
import WorkflowsPage from "@/pages/WorkflowsPage";
import WorkflowBuilderPage from "@/pages/WorkflowBuilderPage";
import ExecutionsPage from "@/pages/ExecutionsPage";
import { ConnectionsPage, CredentialsPage, IntegrationLogsPage, WebhooksPage } from "@/pages/IntegrationResourcePages";
import ExternalIncidentReviewsPage from "@/pages/ExternalIncidentReviewsPage";
import ApiDocsPage from "@/pages/ApiDocsPage";
import DashboardsReportsPage from "@/pages/DashboardsReportsPage";
import WorkShiftOperations from "@/pages/WorkShiftOperations";
import ManualsHelpPage from "@/pages/ManualsHelpPage";
import LoginPage from "@/pages/LoginPage";
import { useAuth } from "@/_core/hooks/useAuth";
import { isFieldAgent } from "@/lib/operationalAccess";
import { trpc } from "@/lib/trpc";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function FieldRestrictedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const access = trpc.access.me.useQuery(undefined, { retry: false });
  if (loading || access.isLoading) return null;
  if (isFieldAgent(user?.operationalRole, access.data?.assignments)) return <Redirect to="/agente" />;
  return <Component />;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/login"} component={LoginPage} />
      <Route path={"/"} component={() => <FieldRestrictedRoute component={Home} />} />
      <Route path={"/dashboards-relatorios"} component={() => <FieldRestrictedRoute component={DashboardsReportsPage} />} />
      <Route path={"/operacao-jornada"} component={() => <FieldRestrictedRoute component={WorkShiftOperations} />} />
      <Route path={"/ocorrencias"} component={IncidentsPage} />
      <Route path={"/ocorrencias/:id"} component={IncidentDetailPage} />
      <Route path={"/equipes"} component={TeamsPage} />
      <Route path={"/kanban"} component={() => <FieldRestrictedRoute component={KanbanPage} />} />
      <Route path={"/agente"} component={AgentPage} />
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
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
