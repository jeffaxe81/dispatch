import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.resolve(import.meta.dirname);
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["server/tenantAudit.mysql-homologation.ts"],
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 20_000,
    hookTimeout: 120_000,
    reporters: ["verbose", "junit"],
    outputFile: { junit: "artifacts/audit-mysql/junit.xml" },
  },
});
