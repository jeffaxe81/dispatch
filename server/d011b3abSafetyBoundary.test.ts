import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

const productionFiles = [
  "server/_core/activeRecoveryAuthorization.ts",
  "server/_core/activeRecoveryBootstrap.ts",
  "server/_core/recoveryLease.ts",
  "server/_core/recoveryActionRecord.ts",
  "server/_core/recoveryActiveCoordinator.ts",
] as const;

const sources = new Map(
  productionFiles.map(file => [file, fs.readFileSync(path.join(root, file), "utf8")]),
);
const combinedSource = productionFiles.map(file => sources.get(file) ?? "").join("\n");

const forbiddenCapabilities: ReadonlyArray<[string, RegExp]> = [
  ["child_process", /(?:node:child_process|\bchild_process\b)/],
  ["process execution API", /\b(?:exec|execFile|spawn|fork)\s*\(/],
  ["systemctl", /\bsystemctl\b/],
  ["dockerode", /\bdockerode\b/i],
  ["kubernetes", /(?:@kubernetes|\bkubernetes\b)/i],
  ["ssh2", /\bssh2\b/],
  ["runRestore", /\brunRestore\b/],
  ["runBackup", /\brunBackup\b/],
  ["disaster recovery coupling", /(?:\.\.\/recovery|\.\/recovery\/)/],
];

function walkProductionSource(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkProductionSource(absolute);
    if (!/\.(?:ts|tsx)$/.test(entry.name)) return [];
    if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) return [];
    return [absolute];
  });
}

describe("D-011B.3a/3b structural safety boundary", () => {
  it("keeps infrastructure execution and disaster recovery capabilities out of production modules", () => {
    for (const [label, pattern] of forbiddenCapabilities) {
      expect(combinedSource, `D-011B.3a/3b must not contain ${label}`).not.toMatch(pattern);
    }
  });

  it("keeps the coordinator preparation-only with no action execution dependency", () => {
    const coordinatorSource = sources.get("server/_core/recoveryActiveCoordinator.ts") ?? "";
    expect(coordinatorSource).not.toContain("RecoveryActionPort");
    expect(coordinatorSource).not.toMatch(/actionPort\s*\.\s*execute/);
    expect(coordinatorSource).not.toMatch(/\.execute\s*\(/);
  });

  it("keeps bootstrap simulation-only and active recovery disabled by default", () => {
    const bootstrapSource = sources.get("server/_core/activeRecoveryBootstrap.ts") ?? "";
    expect(bootstrapSource).toContain("createSimulatedRecoveryAdapter");
    expect(bootstrapSource).toContain("enabled: false");
    expect(bootstrapSource).not.toContain("ACTIVE_RECOVERY_ENABLED");
    expect(bootstrapSource).not.toMatch(/process\.env/);
  });

  it("keeps production permanently outside the authorized environment", () => {
    const authorizationSource = sources.get("server/_core/activeRecoveryAuthorization.ts") ?? "";
    expect(authorizationSource).toContain('authorizedEnvironment: "homologation-controlled"');
    expect(authorizationSource).toMatch(/config\.environment === "production"/);
  });

  it("exports no production in-memory recovery lease implementation", () => {
    const leaseSource = sources.get("server/_core/recoveryLease.ts") ?? "";
    expect(leaseSource).not.toMatch(/(?:class|function|const)\s+\w*(?:Memory|InMemory)\w*/i);
    expect(leaseSource).not.toMatch(/new\s+Map\s*</);
  });

  it("keeps coordinator and authorization mutators out of HTTP, router and UI production surfaces", () => {
    const candidateFiles = [
      ...walkProductionSource(path.join(root, "server")),
      ...walkProductionSource(path.join(root, "client", "src")),
    ].filter(file => !productionFiles.some(productionFile => file === path.join(root, productionFile)));

    for (const file of candidateFiles) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toContain("createRecoveryActiveCoordinator");
      expect(source, file).not.toMatch(/(?:set|toggle|enable|disable)ActiveRecovery/i);
    }
  });
});
