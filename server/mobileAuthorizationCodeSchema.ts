/**
 * Dormant Android authorization-code storage.
 * No routes consume this table until native auth review, DB migration,
 * verified App Links and operational authorization are completed.
 * Only SHA-256 hashes of random code/device identifiers are stored.
 */
import { bigint, index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const mobileAuthorizationCodes = mysqlTable(
  "mobile_authorization_codes",
  {
    codeHash: varchar("code_hash", { length: 64 }).primaryKey(),
    clientId: varchar("client_id", { length: 100 }).notNull(),
    redirectUri: varchar("redirect_uri", { length: 512 }).notNull(),
    codeChallenge: varchar("code_challenge", { length: 43 }).notNull(),
    userId: int("user_id").notNull(),
    organizationId: int("organization_id").notNull(),
    teamId: int("team_id").notNull(),
    deviceHash: varchar("device_hash", { length: 64 }).notNull(),
    issuedAtMs: bigint("issued_at_ms", { mode: "number" }).notNull(),
    expiresAtMs: bigint("expires_at_ms", { mode: "number" }).notNull(),
    consumedAtMs: bigint("consumed_at_ms", { mode: "number" }),
    revokedAtMs: bigint("revoked_at_ms", { mode: "number" }),
  },
  table => [
    index("mobile_auth_codes_device_idx").on(table.deviceHash),
    index("mobile_auth_codes_expiry_idx").on(table.expiresAtMs),
  ],
);
