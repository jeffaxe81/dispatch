import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateRecoveryExecutorCapability } from "./_core/recoveryExecution";

const here = dirname(fileURLToPath(import.meta.url));

const D011B4_RUNTIME_FILES = [
  "_core/recoveryExecution.ts",
  "_core/recoveryExecutionSafetyGuard.ts",
  "_core/recoveryActionRecord.ts",
  "_core/recoveryExecutionBoundary.ts",
  "_core/recoveryExecutionAudit.ts",
  "_core/activeRecoveryBootstrap.ts",
] as const;

const FORBIDDEN_RUNTIME_PATTERNS = [
  /from\s+["'](?:node:)?child_process["']/,
  /require\s*\(\s*["'](?:node:)?child_process["']\s*\)/,
  /from\s+["'](?:dockerode|@kubernetes\/client-node|execa|ssh2)["']/,
  /\b(?:systemctl|kubectl|docker|podman)\s+[a-z-]+/i,
] as const;

function source(relativePath: string) {
  return readFileSync(resolve(here, relativePath), "utf8");
}

describe("D-011B.4 structural safety boundary", () => {
  it("não importa nem registra mecanismos reais de processo, container, orquestrador ou SSH", () => {
    for (const relativePath of D011B4_RUNTIME_FILES) {
      const contents = source(relativePath);
      for (const forbidden of FORBIDDEN_RUNTIME_PATTERNS) {
        expect(contents, `${relativePath} contém padrão proibido ${forbidden}`).not.toMatch(forbidden);
      }
    }
  });

  it("mantém a capability do executor fechada em simulation/noop", () => {
    expect(validateRecoveryExecutorCapability("simulation")).toEqual({ valid: true });
    expect(validateRecoveryExecutorCapability("noop")).toEqual({ valid: true });
    expect(validateRecoveryExecutorCapability("real")).toEqual({
      valid: false,
      reasonCode: "REAL_EXECUTOR_FORBIDDEN",
    });
    expect(validateRecoveryExecutorCapability("docker")).toEqual({
      valid: false,
      reasonCode: "REAL_EXECUTOR_FORBIDDEN",
    });
  });
});
