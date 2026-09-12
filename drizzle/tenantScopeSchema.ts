import { index, int, mysqlTable, timestamp } from "drizzle-orm/mysql-core";
import { incidents, organizations, vehicles } from "./schema";

export const incidentTenantScopes = mysqlTable(
  "incident_tenant_scopes",
  {
    incidentId: int("incident_id").primaryKey().references(() => incidents.id, { onDelete: "cascade" }),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("incident_tenant_scopes_org_idx").on(table.organizationId)],
);

export const vehicleTenantScopes = mysqlTable(
  "vehicle_tenant_scopes",
  {
    vehicleId: int("vehicle_id").primaryKey().references(() => vehicles.id, { onDelete: "cascade" }),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("vehicle_tenant_scopes_org_idx").on(table.organizationId)],
);
