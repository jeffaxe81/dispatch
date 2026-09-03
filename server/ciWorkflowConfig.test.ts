import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "..");
const workflowPath = path.join(root, ".github/workflows/quality.yml");
const workflowSource = fs.existsSync(workflowPath)
  ? fs.readFileSync(workflowPath, "utf8")
  : "";
const workflow = workflowSource ? YAML.parse(workflowSource) : {};
const qualityJob = workflow.jobs?.quality;
const steps = qualityJob?.steps ?? [];

describe("workflow de qualidade do GitHub", () => {
  it("existe e é um YAML válido", () => {
    expect(
      fs.existsSync(workflowPath),
      "Crie .github/workflows/quality.yml",
    ).toBe(true);
    expect(workflow.name).toBe("Qualidade");
  });

  it("valida propostas e alterações da main, além da execução manual", () => {
    expect(workflow.on).toEqual({
      pull_request: { branches: ["main"] },
      push: { branches: ["main"] },
      workflow_dispatch: {},
    });
  });

  it("usa permissões mínimas, concorrência cancelável e timeout", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toEqual({
      group: "quality-${{ github.workflow }}-${{ github.ref }}",
      "cancel-in-progress": true,
    });
    expect(qualityJob?.["runs-on"]).toBe("ubuntu-latest");
    expect(qualityJob?.["timeout-minutes"]).toBe(20);
  });

  it("fixa ações oficiais por SHA completo e prepara Node 24 sem cache", () => {
    const actionSteps = steps.filter((step: { uses?: string }) => step.uses);
    expect(actionSteps.map((step: { uses: string }) => step.uses)).toEqual([
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    ]);
    for (const step of actionSteps) {
      expect(step.uses).toMatch(/^actions\/[a-z-]+@[0-9a-f]{40}$/);
    }

    const setupNode = actionSteps[1];
    expect(setupNode.with).toEqual({
      "node-version": 24,
      "package-manager-cache": false,
    });
    expect(workflowSource).toContain("# v7.0.1");
    expect(workflowSource).toContain("# v7.0.0");
  });

  it("executa os portões locais na ordem segura", () => {
    const commands = steps
      .filter((step: { run?: string }) => step.run)
      .map((step: { run: string }) => step.run);

    expect(commands).toEqual([
      "corepack enable",
      "corepack pnpm install --frozen-lockfile",
      "corepack pnpm security:check",
      "corepack pnpm check",
      "corepack pnpm test",
      "corepack pnpm build",
    ]);
  });

  it("não usa segredos, integração, escrita ou entrega", () => {
    expect(workflowSource).not.toMatch(/\bsecrets\s*\./i);
    expect(workflowSource).not.toContain("test:integration");
    expect(workflowSource).not.toMatch(/\b(write|deploy|publish)\b/i);
    expect(workflowSource).not.toContain("pull_request_target");
  });
});
