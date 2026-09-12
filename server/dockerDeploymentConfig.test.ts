import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("package.json"));
const compose = YAML.parse(read("docker-compose.yml"));
const dockerfile = read("Dockerfile");
const qualityWorkflow = read(".github/workflows/quality.yml");

describe("empacotamento Docker para produção", () => {
  it("não envia segredos e artefatos locais para o contexto Docker", () => {
    const dockerignorePath = path.join(root, ".dockerignore");
    expect(fs.existsSync(dockerignorePath)).toBe(true);
    const dockerignore = fs.readFileSync(dockerignorePath, "utf8");
    for (const pattern of [".env", ".git", "node_modules", "dist", "coverage", ".manus-logs"]) {
      expect(dockerignore).toContain(pattern);
    }
  });

  it("padroniza o runtime Docker na mesma major de Node usada pela CI", () => {
    expect(dockerfile).toContain("node:24-bookworm-slim");
    expect(dockerfile).not.toContain("node:22-bookworm-slim");
  });

  it("expõe um alvo de migração explícito e reproduzível", () => {
    expect(manifest.scripts?.["db:migrate"]).toBe("drizzle-kit migrate");
    expect(dockerfile).toContain("AS migration");
    expect(dockerfile).toContain('CMD ["pnpm", "db:migrate"]');
  });

  it("executa migrações após o MySQL ficar saudável e antes de iniciar a aplicação", () => {
    expect(compose.services?.migrate?.build?.target).toBe("migration");
    expect(compose.services?.migrate?.depends_on?.mysql?.condition).toBe("service_healthy");
    expect(compose.services?.app?.depends_on?.migrate?.condition).toBe("service_completed_successfully");
  });

  it("mantém a porta interna fixa e publica somente APP_PORT externamente", () => {
    expect(compose.services?.app?.environment?.PORT).toBe(3000);
    expect(compose.services?.app?.ports).toEqual(["${APP_PORT:-3000}:3000"]);
  });

  it("monitora a aplicação pelo endpoint de liveness já existente", () => {
    const healthcheck = JSON.stringify(compose.services?.app?.healthcheck ?? {});
    expect(healthcheck).toContain("/health/live");
  });

  it("valida Docker Compose e as imagens no workflow de qualidade", () => {
    expect(qualityWorkflow).toContain("docker compose config");
    expect(qualityWorkflow).toContain("docker compose build app migrate");
  });
});
