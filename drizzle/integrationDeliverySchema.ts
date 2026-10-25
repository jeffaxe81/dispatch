import { bigint, index, int, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { organizations } from "./schema";

const integrationSystemValues = ["neo", "inventory", "crm"] as const;
const integrationModeValues = ["api", "event"] as const;
const integrationDeliveryStatusValues = ["pending", "leased", "delivered", "dead_letter"] as const;
const integrationFailureKindValues = [
  "timeout",
  "unavailable",
  "rate_limited",
  "contract_mismatch",
  "authorization",
  "unknown",
] as const;

export const integrationDeliveryOutbox = mysqlTable(
  "integration_delivery_outbox",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    system: mysqlEnum("system", integrationSystemValues).notNull(),
    contractVersion: int("contract_version").notNull().default(1),
    mode: mysqlEnum("mode", integrationModeValues).notNull(),
    operation: varchar("operation", { length: 160 }).notNull(),
    messageId: varchar("message_id", { length: 160 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    correlationId: varchar("correlation_id", { length: 160 }).notNull(),
    status: mysqlEnum("status", integrationDeliveryStatusValues).notNull().default("pending"),
    deliveryVersion: int("delivery_version").notNull().default(0),
    deliveryAttempts: int("delivery_attempts").notNull().default(0),
    maxAttempts: int("max_attempts").notNull(),
    failureThreshold: int("failure_threshold").notNull(),
    cooldownSeconds: int("cooldown_seconds").notNull(),
    leaseOwner: varchar("lease_owner", { length: 120 }),
    leaseToken: varchar("lease_token", { length: 160 }),
    leaseExpiresAtMs: bigint("lease_expires_at_ms", { mode: "number", unsigned: true }),
    nextAttemptAtMs: bigint("next_attempt_at_ms", { mode: "number", unsigned: true }),
    deliveredAtMs: bigint("delivered_at_ms", { mode: "number", unsigned: true }),
    deadLetteredAtMs: bigint("dead_lettered_at_ms", { mode: "number", unsigned: true }),
    payloadReference: varchar("payload_reference", { length: 512 }),
    lastFailureKind: mysqlEnum("last_failure_kind", integrationFailureKindValues),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("integration_delivery_outbox_tenant_idempotency_unique").on(table.organizationId, table.idempotencyKey),
    index("integration_delivery_outbox_claim_idx").on(table.organizationId, table.status, table.nextAttemptAtMs),
    index("integration_delivery_outbox_correlation_idx").on(table.organizationId, table.correlationId),
  ],
);
