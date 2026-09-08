import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

const implementationFiles = [
  "server/_core/recoveryAction.ts",
  "server/_core/simulatedRecoveryAdapter.ts",
  "server/_core/recoveryOrchestrator.ts",
  "server/_core/recoveryBootstrap.ts",
] as const;

const sources = new Map(
  implementationFiles.map(file => [file, fs.readFileSync(path.join(root, file), "utf8")]),
);

const combinedSource = implementationFiles.map(file => sources.get(file) ?? "").join("\n");

const forbiddenCapabilities: ReadonlyArray<[string, RegExp]> = [
  ["child_process import/require", /(?:from\s+["'](?:node:)?child_process["']|require\(\s*["'](?:node:)?child_process["']\s*\))/],
  ["process execution API", /\b(?:exec|execFile|spawn|fork)\s*\(/],
  ["service manager command", /\b(?:systemctl|service|docker|podman|kubectl)\b/],
  ["Docker/Kubernetes SDK", /(?:dockerode|@kubernetes\/client-node|kubernetes)/i],
  ["administrative recovery coupling", /(?:from\s+["'][^"']*\/recovery(?:\/|["'])|require\(\s*["'][^"']*\/recovery(?:\/|["']))/],
  ["process.kill", /\bprocess\.kill\s*\(/],
  ["new scheduler loop", /\bsetInterval\s*\(/],
];

describe("D-011B.2 simulated recovery structural safety boundary", () => {
  it("keeps process, infrastructure, disaster recovery and scheduler capabilities out of implementation", () => {
    for (const [label, pattern] of forbiddenCapabilities) {
      expect(combinedSource, `D-011B.2 must not contain ${label}`).not.toMatch(pattern);
    }
  });

  it("keeps arbitrary execution and infrastructure locator fields out of RecoveryActionRequest", () => {
    const actionSource = sources.get("server/_core/recoveryAction.ts") ?? "";
    const unsafeFieldNames = [
      "command",
      "shellCommand",
      "executable",
      "containerId",
      "podUid",
      "sshHost",
    ] as const;

    for (const field of unsafeFieldNames) {
      expect(actionSource, `RecoveryActionRequest must not expose ${field}`).not.toMatch(
        new RegExp(`\\b${field}\\s*[?:]`),
      );
    }
  });

  it("keeps the test harness out of runtime bootstrap and server entrypoint", () => {
    const bootstrapSource = sources.get("server/_core/recoveryBootstrap.ts") ?? "";
    const indexSource = fs.readFileSync(path.join(root, "server/_core/index.ts"), "utf8");

    expect(bootstrapSource).not.toContain("recoveryActionHarness");
    expect(indexSource).not.toContain("recoveryActionHarness");
  });

  it("keeps the concrete runtime adapter simulation-only", () => {
    const adapterSource = sources.get("server/_core/simulatedRecoveryAdapter.ts") ?? "";
    const bootstrapSource = sources.get("server/_core/recoveryBootstrap.ts") ?? "";

    expect(adapterSource).toContain('"simulated_success"');
    expect(adapterSource).toContain('"simulated_failure"');
    expect(adapterSource).toContain('"simulated_timeout"');
    expect(adapterSource).toContain('"simulated_cancelled"');
    expect(bootstrapSource).toContain('scenario: "success"');
    expect(bootstrapSource).not.toMatch(/process\.env.*(?:RECOVERY|SCENARIO|ACTION)/i);
  });
});
