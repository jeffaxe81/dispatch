import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const requireCondition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const packageJson = JSON.parse(read("package.json"));
requireCondition(packageJson.version === "1.15.0", "A versão segura esperada é 1.15.0.");

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
requireCondition(read("server/_core/storageProxy.ts").indexOf("authenticateRequest") < read("server/_core/storageProxy.ts").indexOf("storageGetSignedUrl(key)"), "O armazenamento assina a URL antes de autenticar o usuário.");
requireCondition(read("server/routers.ts").includes("resolveAuthorizedTeamFilter"), "Relatórios/exportações não aplicam o filtro de escopo autorizado.");
requireCondition(read("server/alrtIngress.ts").includes("express.json({ limit: MAX_ALRT_PAYLOAD_BYTES"), "O limite ALRT não está aplicado no parser da rota.");
requireCondition(!read("server/_core/index.ts").includes('limit: "50mb"'), "O parser global inseguro de 50 MB foi reintroduzido.");
requireCondition(read("client/src/const.ts").includes("OAUTH_STATE_COOKIE_LOCAL"), "O fluxo OAuth local seguro não está configurado.");

console.log(`Verificação de segurança aprovada: ${trackedMigrations.length} migrações e 7 correções preservadas.`);
