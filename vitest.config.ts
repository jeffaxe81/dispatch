import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.unit.setup.ts"],
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/src/**/*.test.ts", "client/src/**/*.spec.ts", "client/src/**/*.test.tsx", "client/src/**/*.spec.tsx"],
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
    environmentMatchGlobs: [["client/src/pages/WorkflowBuilderPage.full.test.tsx", "jsdom"], ["client/src/pages/ExecutionsPage.test.tsx", "jsdom"], ["client/src/pages/IntegrationResourcePages.test.tsx", "jsdom"], ["client/src/pages/ExternalIncidentReviewsPage.test.tsx", "jsdom"], ["client/src/pages/ApiDocsPage.test.tsx", "jsdom"], ["client/src/pages/AgentPage.test.tsx", "jsdom"], ["client/src/pages/GeneralSettingsPage.test.tsx", "jsdom"]],
  },
});
