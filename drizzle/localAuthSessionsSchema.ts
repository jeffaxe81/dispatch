import { index, int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "./schema";

/**
 * Persist only a SHA-256 digest of the JWT's random jti; never the JWT or
 * plaintext identifier. Shared by every backend instance for revocation.
 */
export const localAuthSessions = mysqlTable(
  "local_auth_sessions",
  {
    sessionHash: varchar("session_hash", { length: 64 }).primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [
    index("local_auth_sessions_user_idx").on(table.userId),
    index("local_auth_sessions_expiry_idx").on(table.expiresAt),
  ],
);
