import { bigint, int, mysqlEnum, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { organizations } from "../../drizzle/schema";

/**
 * J6D: One explicitly authorized emitting source per (tenant, component).
 * The database enforces uniqueness even across application replicas.
 */
export const workflowSlaComponentHeartbeats = mysqlTable(
  "workflow_sla_component_heartbeats",
  {
    organizationId: int("organization_id").notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    component: mysqlEnum("component", ["scheduler", "adapter"]).notNull(),
    sourceId: varchar("source_id", { length: 80 }).notNull(),
    sequence: bigint("sequence", { mode: "number", unsigned: true }).notNull(),
    state: mysqlEnum("state", ["healthy", "degraded", "unhealthy"]).notNull(),
    sentAtMs: bigint("sent_at_ms", { mode: "number", unsigned: true }).notNull(),
    receivedAtMs: bigint("received_at_ms", { mode: "number", unsigned: true }).notNull(),
  },
  table => [primaryKey({ columns: [table.organizationId, table.component] })],
);
