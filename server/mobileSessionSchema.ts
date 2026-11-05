/**
 * Dormant native mobile session ledger. No tRPC or Express routes use it.
 * Never persist plaintext opaque handles or Android device identifiers.
 * A separate, reviewed schema migration is required before use.
 */
import { bigint, index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const mobileSessions = mysqlTable(
  "mobile_sessions",
  {
    sessionHash: varchar("session_hash", { length: 64 }).primaryKey(),
    deviceHash: varchar("device_hash", { length: 64 }).notNull(),
    userId: int("user_id").notNull(),
    organizationId: int("organization_id").notNull(),
    teamId: int("team_id").notNull(),
    issuedAtMs: bigint("issued_at_ms", { mode: "number" }).notNull(),
    expiresAtMs: bigint("expires_at_ms", { mode: "number" }).notNull(),
    revokedAtMs: bigint("revoked_at_ms", { mode: "number" }),
  },
  table => [
    index("mobile_sessions_device_revoked_idx").on(table.deviceHash, table.revokedAtMs),
    index("mobile_sessions_expiry_idx").on(table.expiresAtMs),
    index("mobile_sessions_user_org_idx").on(table.userId, table.organizationId),
  ],
);
