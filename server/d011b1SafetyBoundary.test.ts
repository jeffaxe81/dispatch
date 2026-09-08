import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const productionFiles = [
  "server/_core/recoveryPolicy.ts",
  "server/_core/recoveryPolicyStore.ts",
  "server/_core/recoveryAction.ts",
  "server/_core/simulatedRecoveryAdapter.ts",
  "server/_core/recoveryOrchestrator.ts",
  "server/_core/recoveryBootstrap.ts",
] as const;

const forbidden = [
  "node:child_process",
  "child_process",
  "dockerode",
  "kubernetes",
  "systemctl",
  "pm2",
  "ssh2",
  "runRestore",
  "runBackup",
  "../recovery",
  "./recovery/",
] as const;

const sources = new Map(
  productionFiles.map(file => [file, fs.readFileSync(path.join(root, file), "utf8")]),
);

describe("D-011B.1/D-011B.2 simulated recovery safety boundary", () => {
  it("mantém módulos de processo, infraestrutura e recovery administrativo fora do escopo", () => {
    for (const [file, source] of sources) {
      for (const token of forbidden) {
        expect(source, `${file} must not contain forbidden capability: ${token}`).not.toContain(token);
      }
    }
  });

  it("mantém a implementação concreta explicitamente simulada", () => {
    const source = sources.get("server/_core/simulatedRecoveryAdapter.ts") ?? "";
    expect(source).toContain('"simulated_success"');
    expect(source).toContain('"simulated_failure"');
    expect(source).not.toContain("recoveryDryRunExecutor");
  });

  it("não exporta adapters ou executores de recuperação real", () => {
    const source = productionFiles.map(file => sources.get(file) ?? "").join("\n");
    const forbiddenExports = ["RestartAdapter", "RealRecoveryExecutor", "InfrastructureExecutor"];

    for (const symbol of forbiddenExports) {
      expect(source, `D-011B.1/D-011B.2 must not export ${symbol}`).not.toMatch(
        new RegExp(`export\\s+(?:type\\s+|interface\\s+|class\\s+|function\\s+|const\\s+)?${symbol}\\b`),
      );
    }
  });
});
