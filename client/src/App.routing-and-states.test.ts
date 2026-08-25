import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

const routes = [
  "/",
  "/dashboards-relatorios",
  "/ocorrencias",
  "/ocorrencias/:id",
  "/equipes",
  "/kanban",
  "/agente",
  "/viaturas",
  "/integracoes",
  "/integracoes/workflows",
  "/integracoes/workflows/:id",
  "/integracoes/execucoes",
  "/integracoes/conexoes",
  "/integracoes/webhooks",
  "/integracoes/credenciais",
  "/integracoes/logs",
  "/integracoes/revisoes-externas",
  "/integracoes/api-docs",
  "/manuais-ajuda",
  "/administracao",
  "/administracao/usuarios",
  "/administracao/perfis",
  "/administracao/escopos",
  "/administracao/configuracoes",
  "/administracao/log-operacoes",
  "/404",
];

const primaryPages = [
  "Home.tsx",
  "DashboardsReportsPage.tsx",
  "IncidentsPage.tsx",
  "TeamsPage.tsx",
  "KanbanPage.tsx",
  "AgentPage.tsx",
  "IntegrationsPage.tsx",
  "GeneralSettingsPage.tsx",
  "ManualsHelpPage.tsx",
];

describe("roteamento e estados principais preservados", () => {
  it("mantém as 26 rotas explícitas e o fallback sem becos sem saída", () => {
    const app = read("client/src/App.tsx");

    for (const route of routes) expect(app).toContain(`path={"${route}"}`);
    expect(app).toContain("<Route component={NotFound} />");
    expect(app).toContain("<ErrorBoundary>");
    expect(app).toContain('return <Redirect to="/agente" />');
  });

  it("mantém estados globais de carregamento, sessão e recuperação de erro", () => {
    const layout = read("client/src/components/DashboardLayout.tsx");
    const app = read("client/src/App.tsx");

    expect(layout).toContain("DashboardLayoutSkeleton");
    expect(layout).toContain("Acesso operacional");
    expect(layout).toContain("startLogin()");
    expect(app).toContain("ErrorBoundary");
    expect(app).toContain("Toaster");
  });

  it.each(primaryPages)("expõe estados de consulta ou mutação em %s", pageName => {
    const page = read(`client/src/pages/${pageName}`);
    expect(page).toMatch(/isLoading|isFetching|isPending|QueryState|loading/);
    expect(page).toMatch(/\.error|isError|role="alert"|QueryState|ErrorBoundary|error=/);
    expect(page).toMatch(/Nenhum|Nenhuma|Ainda não|Sem ocorr|length|data\?\./);
  });
});
