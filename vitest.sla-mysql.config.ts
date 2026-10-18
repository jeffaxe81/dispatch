import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.resolve(import.meta.dirname);
export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "client/src"),
      "@shared": path.resolve(root, "shared"),
      "@assets": path.resolve(root, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.sla-mysql.test.ts"],
    globalSetup: ["./vitest.sla-mysql.global-setup.ts"],
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 60_000,
    reporters: ["verbose", "junit"],
    outputFile: { junit: "artifacts/sla-mysql/junit.xml" },
  },
});
