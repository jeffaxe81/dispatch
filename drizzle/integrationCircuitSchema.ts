import { bigint, index, int, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { organizations } from "./schema";

const integrationSystemValues = ["neo", "inventory", "crm"] as const;
const circuitStateValues = ["closed", "open", "half_open"] as const;

export const integrationCircuitState = mysqlTable(
  "integration_circuit_state",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    system: mysqlEnum("system", integrationSystemValues).notNull(),
    state: mysqlEnum("state", circuitStateValues).notNull().default("closed"),
    circuitVersion: int("circuit_version").notNull().default(0),
    consecutiveFailures: int("consecutive_failures").notNull().default(0),
    openedAtMs: bigint("opened_at_ms", { mode: "number", unsigned: true }),
    cooldownUntilMs: bigint("cooldown_until_ms", { mode: "number", unsigned: true }),
    probeLeaseOwner: varchar("probe_lease_owner", { length: 120 }),
    probeLeaseToken: varchar("probe_lease_token", { length: 160 }),
    probeLeaseExpiresAtMs: bigint("probe_lease_expires_at_ms", { mode: "number", unsigned: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("integration_circuit_tenant_system_unique").on(table.organizationId, table.system),
    index("integration_circuit_state_idx").on(table.organizationId, table.state, table.cooldownUntilMs),
  ],
);
