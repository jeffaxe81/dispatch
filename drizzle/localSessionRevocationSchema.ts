import { index, int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Durable denylist shared by all AXE Despacho instances.
 * Store SHA-256 of an already signed JWT, never the bearer token itself.
 * Legacy JWTs without jti may also be revoked by their token hash.
 */
export const localRevokedSessions = mysqlTable(
  "local_revoked_sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: int("user_id").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at").defaultNow().notNull(),
  },
  table => [
    index("local_revoked_sessions_user_idx").on(table.userId),
    index("local_revoked_sessions_expires_idx").on(table.expiresAt),
  ],
);
