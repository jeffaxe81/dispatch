import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const requireCondition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const packageJson = JSON.parse(read("package.json"));
requireCondition(packageJson.version === "2.17.0", "A versão segura esperada é 2.17.0.");

const journal = JSON.parse(read("drizzle/meta/_journal.json"));
const trackedMigrations = journal.entries.map(entry => `${entry.tag}.sql`);
requireCondition(new Set(trackedMigrations).size === trackedMigrations.length, "O diário contém migrações duplicadas.");
for (const migration of trackedMigrations) {
  requireCondition(fs.existsSync(path.join(root, "drizzle", migration)), `Migração ausente: ${migration}`);
}
const numberedMigrations = fs.readdirSync(path.join(root, "drizzle")).filter(name => /^\d{4}_.+\.sql$/.test(name));
const untracked = numberedMigrations.filter(name => !trackedMigrations.includes(name));
requireCondition(untracked.length === 0, `Migrações fora do diário: ${untracked.join(", ")}`);
requireCondition((read("docs/legacy-migrations/sql/0004_windy_mad_thinker.sql").match(/ADD `organization_id`/g) ?? []).length === 1, "A migração histórica 0004 voltou a adicionar organization_id mais de uma vez.");
requireCondition(read("drizzle/0001_abandoned_kinsey_walden.sql").includes("CREATE TABLE `incidents`"), "A migração consolidada não contém o domínio operacional de ocorrências.");

requireCondition(!fs.existsSync(path.join(root, "dist/index.js")), "O pacote contém um bundle dist antigo e potencialmente inseguro.");
requireCondition(read("server/_core/index.ts").includes("validateRuntimeEnv();"), "A inicialização não valida a configuração crítica.");
requireCondition(read("server/_core/storageProxy.ts").indexOf("authenticateLocalRequest") < read("server/_core/storageProxy.ts").indexOf("storageGetSignedUrl(key)"), "O armazenamento assina a URL antes de autenticar o usuário.");
requireCondition(read("server/routers.ts").includes("resolveAuthorizedTeamFilter"), "Relatórios/exportações não aplicam o filtro de escopo autorizado.");
requireCondition(read("server/alrtIngress.ts").includes("express.json({ limit: MAX_ALRT_PAYLOAD_BYTES"), "O limite ALRT não está aplicado no parser da rota.");
requireCondition(!read("server/_core/index.ts").includes('limit: "50mb"'), "O parser global inseguro de 50 MB foi reintroduzido.");
requireCondition(!fs.existsSync(path.join(root, "client/src/const.ts")), "O helper OAuth do cliente foi reintroduzido.");
requireCondition(!fs.existsSync(path.join(root, "server/_core/oauth.ts")), "O callback OAuth foi reintroduzido.");
requireCondition(!fs.existsSync(path.join(root, "server/_core/sdk.ts")), "O cliente OAuth do servidor foi reintroduzido.");
requireCondition(read("server/localAuth.ts").includes("scrypt") && read("server/localAuth.ts").includes("timingSafeEqual"), "A senha local não usa derivação e comparação resistentes.");
requireCondition(read("client/src/pages/LoginPage.tsx").includes("trpc.auth.login"), "A tela de login local não está conectada ao procedimento autenticado.");

const formsTrpc = read("server/forms/formsTrpcRouter.ts");
const formsApi = read("server/forms/formsRouter.ts");
const formsAttachments = read("server/forms/formAttachments.ts");
const formsRepositoryDb = read("server/forms/formRepositoryDbAdapter.ts");
const rootRouter = read("server/rootRouter.ts");
requireCondition(formsTrpc.includes(".strict().superRefine("), "D-008 perdeu validação estrita do contexto de submissão no tRPC.");
requireCondition(formsTrpc.includes("MAX_FORM_ATTACHMENT_BASE64_CHARS") && formsTrpc.includes(".max(MAX_FORM_ATTACHMENT_BASE64_CHARS)"), "D-008 perdeu o limite Base64 antes da decodificação do anexo.");
requireCondition(formsApi.includes('await ctx.assertSubmissionScope(submissionId);return invoke("uploadAttachment",input)'), "D-008 permite upload sem validar o escopo da submissão.");
requireCondition(formsAttachments.includes("const stored = await ports.storagePut") && formsAttachments.includes("storageKey: stored.key"), "D-008 não persiste a chave real devolvida pelo storage.");
requireCondition(
  formsRepositoryDb.includes("transaction(async(tx:any)") &&
    formsRepositoryDb.includes("beforeHash=jsonHash(current.answers)") &&
    formsRepositoryDb.includes("afterHash=jsonHash(input.answers)") &&
    formsRepositoryDb.includes("tx.insert(formSubmissionRevisions)") &&
    formsRepositoryDb.includes("beforeHash,afterHash") &&
    formsRepositoryDb.includes("tx.update(formSubmissions)"),
  "D-008 perdeu atomicidade ou hashes antes/depois na correção de submissão.",
);
requireCondition(rootRouter.includes("forms: createFormsTrpcRouter(formsRuntimeContextFactory)"), "D-008 não está registrado no root router protegido.");

// D-010B — Multi-monitor must remain an authorized same-origin projection of one workspace.
const multiMonitorManager = read("client/src/workspace/multimonitor/MultiMonitorManager.ts");
const workspaceChannel = read("client/src/workspace/multimonitor/workspaceChannel.ts");
const workspaceExternalPage = read("client/src/pages/WorkspaceExternalScreenPage.tsx");
const workspaceWidgetRegistry = read("client/src/workspace/widgetRegistry.ts");
requireCondition(multiMonitorManager.includes("/workspace/external?") && multiMonitorManager.includes("workspace: this.workspaceName") && multiMonitorManager.includes("screen: screenId"), "D-010B perdeu a rota same-origin controlada do multi-monitor.");
requireCondition(!multiMonitorManager.includes("tenantId") && !multiMonitorManager.includes("userId") && !multiMonitorManager.includes("http://") && !multiMonitorManager.includes("https://"), "D-010B reintroduziu autoridade de tenant/usuário ou URL remota no launcher.");
requireCondition(workspaceExternalPage.includes('const allowed = new Set(["workspace", "screen"])') && workspaceExternalPage.includes("trpc.workspace.getOwnScreen"), "D-010B perdeu validação estrita da rota externa ou autorização pelo backend.");
requireCondition(workspaceWidgetRegistry.includes("workspaceWidgetRegistry") && workspaceWidgetRegistry.includes("Object.prototype.hasOwnProperty.call(workspaceWidgetRegistry, type)"), "D-010B perdeu o catálogo fechado de widgets.");
for (const eventName of ["workspace-screen-opened", "workspace-screen-closed", "workspace-layout-updated", "workspace-refresh-requested", "workspace-focus-screen"]) {
  requireCondition(workspaceChannel.includes(eventName), `D-010B perdeu evento permitido do canal: ${eventName}`);
}
requireCondition(!workspaceChannel.includes("execute-script"), "D-010B permite evento de execução arbitrária no BroadcastChannel.");

console.log(`Verificação de segurança aprovada: ${trackedMigrations.length} migrações, 17 correções preservadas e D-010B protegido.`);
