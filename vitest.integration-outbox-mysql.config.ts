import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.resolve(import.meta.dirname);
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["server/**/*.mysql-homologation.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 20_000,
    hookTimeout: 120_000,
    reporters: ["verbose", "junit"],
    outputFile: { junit: "artifacts/integration-outbox-mysql/junit.xml" },
  },
});
