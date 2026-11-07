import {defineConfig} from "vitest/config";
import path from "node:path";
const root=path.resolve(import.meta.dirname);
export default defineConfig({
  root,
  resolve:{alias:{"@":path.resolve(root,"client","src"),"@shared":path.resolve(root,"shared"),"@assets":path.resolve(root,"attached_assets")}},
  test:{
    environment:"node",
    setupFiles:["./vitest.unit.setup.ts"],
    include:["scripts/quality/backend10b.campaign.ts"],
    testTimeout:900_000,
    hookTimeout:30_000,
    maxWorkers:1,
    minWorkers:1
  }
});
