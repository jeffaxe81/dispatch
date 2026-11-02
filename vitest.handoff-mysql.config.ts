import path from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  root: path.resolve(import.meta.dirname),
  test: {
    environment:"node",
    include:["server/shiftHandoff.handoff-mysql-homologation.ts"],
    fileParallelism:false,minWorkers:1,maxWorkers:1,
    testTimeout:30000,hookTimeout:120000,reporters:["verbose","junit"],
    outputFile:{junit:"artifacts/handoff-mysql/junit.xml"},
  },
});
