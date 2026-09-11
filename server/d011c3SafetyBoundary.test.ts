import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const D011C3_RUNTIME_FILES = [
  "_core/failoverSimulation.ts",
  "_core/simulatedFailoverAdapter.ts",
] as const;

const FORBIDDEN = [
  "child_process",
  "node:child_process",
  "node:fs",
  "axios",
  "fetch(",
  "mysql2",
  "drizzle-orm",
  "@aws-sdk",
  "kubernetes",
  "docker",
  "podman",
  "ssh",
  "recoveryExecutionBoundary",
  "RecoveryExecutorPort",
] as const;

function source(relativePath: string) {
  return readFileSync(resolve(here, relativePath), "utf8");
}

describe("D-011C.3 simulation-only safety boundary", () => {
  it("keeps both C.3 runtime files free of executor, network, DB and infrastructure integrations", () => {
    for (const relativePath of D011C3_RUNTIME_FILES) {
      const contents = source(relativePath);
      for (const forbidden of FORBIDDEN) {
        expect(contents, `${relativePath} contains forbidden token ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
