import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: [
    "./drizzle/schema.ts",
    "./drizzle/tenantScopeSchema.ts",
    "./drizzle/workShiftSchema.ts",
    "./drizzle/workspaceLayoutSchema.ts",
    "./server/workflow/workflowTaskSchema.ts",
    "./server/workflow/workflowTenantScopeSchema.ts",
  ],
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});