import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "..");
const workflowPath = path.join(root, ".github/workflows/inventory-external-homologation.yml");
const source = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, "utf8") : "";
const workflow = source ? YAML.parse(source) : {};
const job = workflow.jobs?.homologation;
const steps = job?.steps ?? [];

describe("workflow manual de homologação externa do Inventário", () => {
  it("existe, é manual, usa homologation e só executa a partir da main", () => {
    expect(fs.existsSync(workflowPath), "Crie .github/workflows/inventory-external-homologation.yml").toBe(true);
    expect(workflow.name).toBe("Inventory external homologation");
    expect(workflow.on).toEqual({ workflow_dispatch: {} });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(job?.environment).toBe("homologation");
    expect(job?.if).toBe("github.ref == 'refs/heads/main'");
    expect(job?.["runs-on"]).toBe("ubuntu-latest");
    expect(job?.["timeout-minutes"]).toBe(15);
  });

  it("executa somente instalação congelada, preflight e harness", () => {
    const commands = steps.filter((step: { run?: string }) => step.run).map((step: { run: string }) => step.run);
    expect(commands).toContain("corepack enable");
    expect(commands).toContain("corepack pnpm install --frozen-lockfile");
    expect(commands.some((command: string) => command.includes("homologation:inventory"))).toBe(true);
    expect(source).not.toMatch(/\b(db:migrate|db:push|deploy|publish|grant)\b/i);
  });

  it("usa variáveis/segredo do environment e publica somente relatórios", () => {
    expect(source).toContain("ASSET_MOTOR_BASE_URL");
    expect(source).toContain("DISPATCH_BASE_URL");
    expect(source).toContain("HOMOLOGATION_TENANT_A");
    expect(source).toContain("HOMOLOGATION_TENANT_B");
    expect(source).toContain("HOMOLOGATION_AUTH_TOKEN");
    expect(source).toContain("artifacts/homologation");
    expect(source).toContain("actions/upload-artifact@");
  });
});
