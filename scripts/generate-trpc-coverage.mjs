import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(root, "docs/TRPC_CONTRACT_COVERAGE.md");
const routerSources = [
  { path: "server/routers.ts", prefix: null },
  { path: "server/workShiftSchedulesRouter.ts", prefix: "workShiftSchedules" },
  { path: "server/dispatchRouter.ts", prefix: "dispatch" },
  { path: "server/routers/workspace.ts", prefix: "workspace" },
];

const coverageRules = [
  { prefix: "auth", suites: ["server/auth.logout.test.ts", "server/_core/cookies.test.ts", "server/localAuth.test.ts", "server/localAuth.bootstrap.integration.test.ts", "server/localAuth.integration.test.ts"], evidence: "Login local, sessão, contexto autenticado, logout, cookie seguro, bloqueio de tentativas e perfis operacionais." },
  { prefix: "help", suites: ["server/helpCenter.test.ts", "client/src/pages/ManualsHelpPage.test.tsx"], evidence: "Central de ajuda, favoritos e sugestões." },
  { prefix: "dashboard", suites: ["server/operationalReports.test.ts", "client/src/hooks/useRefreshSettings.test.ts"], evidence: "Consultas operacionais, filtros e atualização configurável." },
  { prefix: "reports", suites: ["server/operationalReports.test.ts"], evidence: "Visão geral, exportação auditada e filtros salvos são chamados diretamente pela suíte." },
  { prefix: "integrations", suites: ["server/integrations.test.ts", "server/embeddedApplications.router.test.ts", "server/embeddedApplications.test.ts", "server/embeddedAppCsp.test.ts", "server/openapi.test.ts", "server/alrtIngress.test.ts", "server/homologationMatrix.test.ts", "client/src/pages/IntegrationResourcePages.test.tsx", "client/src/pages/ApiDocsPage.test.tsx", "client/src/pages/ExternalIncidentReviewsPage.test.tsx"], evidence: "Conexões, aplicações incorporadas, webhooks, credenciais, OpenAPI, ALRT, logs e revisão externa." },
  { prefix: "workShifts", suites: ["server/workShifts.router.test.ts", "server/workShiftService.test.ts", "server/workShiftDomain.test.ts", "server/workShiftDbContract.test.ts"], evidence: "Consulta da jornada própria, histórico, controle protegido por RBAC, transições de estado, persistência transacional e espelho operacional." },
  { prefix: "workShiftSchedules", suites: ["server/workShiftSchedules.router.test.ts", "server/workShiftSchedules.rootRouter.test.ts", "server/workShiftSchedulesRuntime.coverage.test.ts", "server/workShiftScheduleService.test.ts", "server/workShiftCoverageService.test.ts", "server/workShiftScheduleDomain.test.ts", "server/workShiftScheduleSchema.test.ts", "server/workShiftScheduleMigration.test.ts", "server/accessControl.test.ts"], evidence: "D-007B: consulta/criação de escalas, associações, exceções, resolução por usuário e cobertura planejada x realizada, com RBAC e escopo organizacional." },
  { prefix: "dispatch", suites: ["server/dispatchRouter.test.ts", "server/dispatch.rootRouter.test.ts", "server/dispatchEligibilityService.test.ts", "server/dispatchEligibilityRuntime.test.ts", "server/dispatchEligibilityDb.test.ts"], evidence: "D-007C: autorização e escopo server-side, elegibilidade por membro/equipe e filtro de candidatos inelegíveis antes do GIS/OSRM." },
  { prefix: "workspace", suites: ["server/routers/workspace.test.ts", "server/rootRouter.workspace.test.ts", "server/workspace/workspaceLayoutService.test.ts", "server/workspace/workspaceLayoutRepository.test.ts", "server/workspace/workspaceAccessContext.test.ts", "client/src/pages/WorkspaceExternalScreenPage.test.tsx", "client/src/workspace/multimonitor/multimonitorSecurity.test.ts"], evidence: "D-010A/B: layout próprio e superfícies autorizadas, tenant/usuário resolvidos exclusivamente no servidor, seletor screenId restrito ao layout autorizado e regressões de segurança do multi-monitor." },
  { prefix: "gis", suites: ["server/gisService.test.ts", "server/routingProvider.test.ts", "client/src/components/LeafletOperationalMap.test.ts"], evidence: "Roteamento OSRM, ranking por proximidade/ETA e representação operacional Leaflet; contratos tRPC exercitados indiretamente pelas regras e serviços GIS." },
  { prefix: "workflows", suites: ["server/workflows.router.test.ts", "server/workflowExecutor.test.ts", "server/workflowTransactions.test.ts", "server/workflowExecutionTransactions.test.ts", "client/src/pages/WorkflowBuilderPage.test.tsx", "client/src/pages/WorkflowBuilderPage.full.test.tsx", "client/src/pages/ExecutionsPage.test.tsx"], evidence: "CRUD, publicação, execução, retry, transações e editor visual." },
  { prefix: "incidents", suites: ["server/incidentLifecycle.router.test.ts", "server/triageAndShift.router.test.ts", "server/incidentEvidence.router.test.ts", "server/incidentEvidence.test.ts", "server/incidentDeletion.test.ts", "server/operationalReports.test.ts", "client/src/pages/AgentPage.test.tsx"], evidence: "Lista/detalhe, criação, atualização, triagem, despacho, aceite, transições, evidências, auditoria, exportação e exclusão." },
  { prefix: "audit", suites: ["server/incidentLifecycle.router.test.ts", "client/src/pages/OperationsLogPage.test.ts"], evidence: "Consulta paginada, filtros e apresentação do log operacional." },
  { prefix: "teams", suites: ["server/teamShift.test.ts", "server/triageAndShift.router.test.ts", "server/accessPolicies.test.ts", "client/src/hooks/useAgentLocation.test.ts"], evidence: "Listagem, jornada/escala, status, localização e restrição à equipe própria." },
  { prefix: "vehicles", suites: ["server/authorization.test.ts", "server/accessControl.test.ts"], evidence: "Permissões de frota e escopo preservados; camada tRPC/db idêntica ao pacote-fonte." },
  { prefix: "administration", suites: ["server/userManagement.test.ts", "server/accessControl.test.ts", "server/accessPolicies.test.ts"], evidence: "Administração de usuários e vínculos operacionais." },
  { prefix: "access", suites: ["server/accessControl.test.ts", "server/accessPolicies.test.ts", "server/authorization.test.ts", "server/scopeHierarchy.test.ts", "server/profilePhoto.test.ts", "server/localAuth.integration.test.ts", "client/src/components/ProfilePhotoControl.test.ts"], evidence: "Papéis, permissões, escopos, atribuições, perfis, credenciais locais e fotos." },
  { prefix: "settings", suites: ["server/solutionReset.test.ts", "server/solutionReset.transactions.test.ts", "client/src/pages/GeneralSettingsPage.test.tsx", "client/src/components/OperationalMap.test.ts", "client/src/components/OpenStreetMapFallback.test.ts"], evidence: "Mapa, configurações futuras e reinicialização controlada." },
];

const procedures = [];
const indirectPrefixes = new Set(["dashboard", "vehicles", "gis"]);

function collectProcedures(source, rootPrefix = null) {
  const routerStack = [];
  for (const line of source.split("\n")) {
    const routerMatch = line.match(/^(\s*)([A-Za-z][A-Za-z0-9]*): router\(\{/);
    const procedureMatch = line.match(/^(\s*)([A-Za-z][A-Za-z0-9]*): (operationalProcedure|publicProcedure|protectedProcedure)/);
    if (!routerMatch && !procedureMatch) continue;

    const indent = (routerMatch?.[1] ?? procedureMatch?.[1] ?? "").length;
    while (routerStack.length && routerStack.at(-1).indent >= indent) routerStack.pop();

    if (routerMatch) {
      routerStack.push({ name: routerMatch[2], indent });
      continue;
    }

    const name = procedureMatch[2];
    const procedureType = procedureMatch[3];
    const pathParts = [...routerStack.map(item => item.name), name];
    if (rootPrefix) pathParts.unshift(rootPrefix);
    procedures.push({ path: pathParts.join("."), procedureType });
  }
}

for (const sourceConfig of routerSources) {
  const absolutePath = path.join(root, sourceConfig.path);
  collectProcedures(fs.readFileSync(absolutePath, "utf8"), sourceConfig.prefix);
}

if (procedures.length !== 115) {
  throw new Error(`Superfície tRPC inesperada: ${procedures.length} procedimentos encontrados; eram esperados 115.`);
}

const duplicatePaths = procedures.map(item => item.path).filter((pathName, index, all) => all.indexOf(pathName) !== index);
if (duplicatePaths.length) throw new Error(`Procedimentos duplicados no inventário: ${[...new Set(duplicatePaths)].join(", ")}`);

const rows = procedures.map(procedure => {
  const rootName = procedure.path.split(".")[0];
  const rule = coverageRules.find(candidate => candidate.prefix === rootName);
  if (!rule) throw new Error(`Procedimento sem classificação ou evidência aprovada: ${procedure.path}`);
  const suites = rule.suites ?? [];
  for (const suite of suites) {
    if (!fs.existsSync(path.join(root, suite))) throw new Error(`Suíte mapeada não encontrada: ${suite}`);
  }
  return {
    ...procedure,
    coverage: indirectPrefixes.has(rootName) ? "indireta" : "direta",
    suites: suites.length ? suites.map(suite => `\`${suite}\``).join("<br>") : "Equivalência estrutural",
    evidence: rule.evidence ?? "Contrato preservado byte a byte no roteador e na camada de dados.",
  };
});

const markdown = `# Cobertura dos contratos tRPC\n\nEste inventário é gerado a partir de \`server/routers.ts\`, \`server/workShiftSchedulesRouter.ts\`, \`server/dispatchRouter.ts\` e \`server/routers/workspace.ts\`, compostos pelo \`server/rootRouter.ts\`. O backend preserva os contratos anteriores e acrescenta D-007B, D-007C e D-010A/B sem remover D-007A nem o GIS legado. A classificação **direta** indica chamadas aos contratos do domínio; **indireta** indica cobertura das mesmas regras e dependências por componentes ou políticas exercitadas pela suíte. O gerador falha se algum procedimento não possuir classificação e evidência.\n\n| Procedimento | Tipo | Cobertura | Suítes relacionadas | Evidência |\n|---|---|---|---|---|\n${rows.map(row => `| \`${row.path}\` | \`${row.procedureType}\` | **${row.coverage}** | ${row.suites} | ${row.evidence} |`).join("\n")}\n\n## Totais\n\n| Métrica | Resultado |\n|---|---:|\n| Procedimentos inventariados | ${rows.length} |\n| Cobertura direta | ${rows.filter(row => row.coverage === "direta").length} |\n| Cobertura indireta | ${rows.filter(row => row.coverage === "indireta").length} |\n| Procedimentos sem classificação | 0 |\n`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, markdown);
console.log(`Inventário tRPC gerado: ${rows.length} procedimentos em ${outputPath}`);
