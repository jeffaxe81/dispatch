import { index, int, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { userRoleAssignments } from "../../drizzle/schema";

export const rbacAssignmentSources = mysqlTable(
  "rbac_assignment_sources",
  {
    assignmentId: int("assignment_id")
      .primaryKey()
      .references(() => userRoleAssignments.id, { onDelete: "cascade" }),
    sourceKey: varchar("source_key", { length: 80 }).notNull(),
    externalAssignmentId: varchar("external_assignment_id", { length: 200 }).notNull(),
    externalSubjectId: varchar("external_subject_id", { length: 200 }).notNull(),
    sourceRevision: varchar("source_revision", { length: 160 }).notNull(),
    lastSynchronizedAt: timestamp("last_synchronized_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("rbac_assignment_sources_external_unique").on(table.sourceKey, table.externalAssignmentId),
    index("rbac_assignment_sources_subject_idx").on(table.sourceKey, table.externalSubjectId),
  ],
);
