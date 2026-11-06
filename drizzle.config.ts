import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: [
    "./drizzle/schema.ts",
    "./drizzle/tenantScopeSchema.ts",
    "./drizzle/localAuthSessionsSchema.ts",
    "./drizzle/workShiftSchema.ts",
    "./server/mobileAuthorizationCodeSchema.ts",
    "./server/mobileSessionSchema.ts",
    "./server/mobileDeviceRegistrySchema.ts",
    "./drizzle/workspaceLayoutSchema.ts",
    "./server/rbac/rbacAssignmentSourceSchema.ts",
    "./server/workflow/workflowTaskSchema.ts",
    "./server/workflow/workflowTenantScopeSchema.ts",
    "./server/workflow/workflowEventReceiptSchema.ts",
    "./server/workflow/workflowSlaEventIntentSchema.ts",
    "./server/workflow/workflowSlaNotificationSchema.ts",
  ],
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
