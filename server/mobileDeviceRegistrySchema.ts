/**
 * Pre-production registry. Device enrollment is an administrator-controlled
 * backend operation, never triggered from a WebView or native request body.
 * A revoked device hash is permanently blocked; no self-service reactivation.
 */
import { bigint, index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const mobileRegisteredDevices = mysqlTable(
  "mobile_registered_devices",
  {
    deviceHash: varchar("device_hash", { length: 64 }).primaryKey(),
    userId: int("user_id").notNull(),
    organizationId: int("organization_id").notNull(),
    teamId: int("team_id").notNull(),
    registeredAtMs: bigint("registered_at_ms", { mode: "number" }).notNull(),
    revokedAtMs: bigint("revoked_at_ms", { mode: "number" }),
  },
  table => [
    index("mobile_registered_devices_user_scope_idx").on(table.userId, table.organizationId, table.teamId),
  ],
);
