import { index, int, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Durable upload reservation, intentionally without incident/user FKs:
 * a permanent incident deletion must NOT delete evidence-cleanup evidence.
 * "reserved" can contain an uploaded blob after a crash; reconciliation
 * must treat stale reservations as potentially orphaned objects.
 */
export const incidentEvidenceUploadAttempts = mysqlTable(
  "incident_evidence_upload_attempts",
  {
    attemptId: varchar("attempt_id", { length: 36 }).primaryKey(),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    incidentId: int("incident_id").notNull(),
    actorUserId: int("actor_user_id").notNull(),
    teamId: int("team_id").notNull(),
    state: mysqlEnum("state", ["reserved", "committed", "cleanup_required"]).notNull().default("reserved"),
    evidenceId: int("evidence_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    uniqueIndex("incident_evidence_upload_attempts_storage_key_unique").on(t.storageKey),
    index("incident_evidence_upload_state_updated_idx").on(t.state, t.updatedAt),
    index("incident_evidence_upload_incident_idx").on(t.incidentId),
  ],
);
