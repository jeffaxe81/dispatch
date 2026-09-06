import { bigint, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import type { FormAnswers, FormSchemaDefinition } from "../shared/forms";
import { organizations, organizationalUnits, teams, users } from "./schema";

const formStatusValues = ["draft", "active", "disabled"] as const;
const formVersionStatusValues = ["draft", "published", "retired"] as const;
const formContextTypeValues = ["incident_category", "incident", "field_activity"] as const;
const formSubmissionStatusValues = ["in_progress", "submitted", "corrected"] as const;
const formAttachmentKindValues = ["image", "file", "simple_signature"] as const;
const formEventTypeValues = ["form.published", "submission.started", "submission.submitted", "submission.corrected", "form.disabled"] as const;
const formEventAggregateTypeValues = ["form", "submission"] as const;
const formEventDeliveryStatusValues = ["pending", "published", "failed"] as const;

export const formTemplates = mysqlTable("form_templates", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenant_id").notNull().references(() => organizations.id), code: varchar("code", { length: 120 }).notNull(), name: varchar("name", { length: 240 }).notNull(), description: text("description"), status: mysqlEnum("status", formStatusValues).notNull().default("draft"), organizationalUnitId: int("organizational_unit_id").references(() => organizationalUnits.id, { onDelete: "set null" }), createdByUserId: int("created_by_user_id").notNull().references(() => users.id), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("form_templates_tenant_code_unique").on(table.tenantId, table.code), index("form_templates_tenant_status_idx").on(table.tenantId, table.status)]);

export const formVersions = mysqlTable("form_versions", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenant_id").notNull().references(() => organizations.id), formId: int("form_id").notNull().references(() => formTemplates.id, { onDelete: "restrict" }), version: int("version").notNull(), definition: json("definition").$type<FormSchemaDefinition>().notNull(), definitionHash: varchar("definition_hash", { length: 64 }).notNull(), status: mysqlEnum("status", formVersionStatusValues).notNull().default("draft"), publishedByUserId: int("published_by_user_id").references(() => users.id, { onDelete: "set null" }), publishedAt: timestamp("published_at"), createdByUserId: int("created_by_user_id").notNull().references(() => users.id), createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("form_versions_form_version_unique").on(table.formId, table.version), index("form_versions_tenant_form_status_idx").on(table.tenantId, table.formId, table.status)]);

export const formBindings = mysqlTable("form_bindings", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenant_id").notNull().references(() => organizations.id), formId: int("form_id").notNull().references(() => formTemplates.id, { onDelete: "restrict" }), formVersionId: int("form_version_id").notNull().references(() => formVersions.id, { onDelete: "restrict" }), contextType: mysqlEnum("context_type", formContextTypeValues).notNull(), contextId: varchar("context_id", { length: 180 }).notNull(), responsibleUserId: int("responsible_user_id").references(() => users.id, { onDelete: "set null" }), teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }), createdByUserId: int("created_by_user_id").notNull().references(() => users.id), createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("form_bindings_tenant_context_idx").on(table.tenantId, table.contextType, table.contextId), index("form_bindings_tenant_form_idx").on(table.tenantId, table.formId, table.formVersionId)]);

export const formSubmissions = mysqlTable("form_submissions", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenant_id").notNull().references(() => organizations.id), formId: int("form_id").notNull().references(() => formTemplates.id, { onDelete: "restrict" }), formVersionId: int("form_version_id").notNull().references(() => formVersions.id, { onDelete: "restrict" }), contextType: mysqlEnum("context_type", formContextTypeValues), contextId: varchar("context_id", { length: 180 }), responsibleUserId: int("responsible_user_id").references(() => users.id, { onDelete: "set null" }), teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }), status: mysqlEnum("status", formSubmissionStatusValues).notNull().default("in_progress"), answers: json("answers").$type<FormAnswers>().notNull(), location: json("location").$type<{ latitude: number; longitude: number } | null>(), submittedByUserId: int("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }), submittedAt: timestamp("submitted_at"), createdByUserId: int("created_by_user_id").notNull().references(() => users.id), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [index("form_submissions_tenant_version_idx").on(table.tenantId, table.formVersionId, table.status), index("form_submissions_context_idx").on(table.tenantId, table.contextType, table.contextId)]);

export const formSubmissionRevisions = mysqlTable("form_submission_revisions", {
  id: int("id").autoincrement().primaryKey(), submissionId: int("submission_id").notNull().references(() => formSubmissions.id, { onDelete: "restrict" }), tenantId: int("tenant_id").notNull().references(() => organizations.id), revision: int("revision").notNull(), answers: json("answers").$type<FormAnswers>().notNull(), reason: text("reason").notNull(), actorUserId: int("actor_user_id").notNull().references(() => users.id), beforeHash: varchar("before_hash", { length: 64 }), afterHash: varchar("after_hash", { length: 64 }).notNull(), createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("form_submission_revisions_revision_unique").on(table.submissionId, table.revision), index("form_submission_revisions_submission_created_idx").on(table.submissionId, table.createdAt)]);

export const formAttachments = mysqlTable("form_attachments", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenant_id").notNull().references(() => organizations.id), submissionId: int("submission_id").notNull().references(() => formSubmissions.id, { onDelete: "restrict" }), revisionId: int("revision_id").references(() => formSubmissionRevisions.id, { onDelete: "set null" }), fieldKey: varchar("field_key", { length: 120 }).notNull(), kind: mysqlEnum("kind", formAttachmentKindValues).notNull(), storageKey: varchar("storage_key", { length: 512 }).notNull(), fileName: varchar("file_name", { length: 255 }).notNull(), mimeType: varchar("mime_type", { length: 160 }).notNull(), sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(), sha256: varchar("sha256", { length: 64 }).notNull(), createdByUserId: int("created_by_user_id").notNull().references(() => users.id), createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("form_attachments_submission_field_idx").on(table.submissionId, table.fieldKey)]);

export const formDomainEvents = mysqlTable("form_domain_events", {
  id: int("id").autoincrement().primaryKey(), eventId: varchar("event_id", { length: 180 }).notNull(), tenantId: int("tenant_id").notNull().references(() => organizations.id), eventType: mysqlEnum("event_type", formEventTypeValues).notNull(), aggregateType: mysqlEnum("aggregate_type", formEventAggregateTypeValues).notNull(), aggregateId: varchar("aggregate_id", { length: 180 }).notNull(), actorUserId: int("actor_user_id").notNull().references(() => users.id), payload: json("payload").$type<Record<string, unknown>>().notNull(), occurredAt: timestamp("occurred_at").notNull(), deliveryStatus: mysqlEnum("delivery_status", formEventDeliveryStatusValues).notNull().default("pending"), attemptCount: int("attempt_count").notNull().default(0), lastAttemptAt: timestamp("last_attempt_at"), nextAttemptAt: timestamp("next_attempt_at"), lastError: text("last_error"), publishedAt: timestamp("published_at"), createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("form_domain_events_event_id_unique").on(table.eventId), index("form_domain_events_delivery_idx").on(table.tenantId, table.deliveryStatus, table.nextAttemptAt), index("form_domain_events_aggregate_idx").on(table.tenantId, table.aggregateType, table.aggregateId)]);

export type FormRecord = typeof formTemplates.$inferSelect;
export type InsertFormRecord = typeof formTemplates.$inferInsert;
export type FormVersionRecord = typeof formVersions.$inferSelect;
export type InsertFormVersionRecord = typeof formVersions.$inferInsert;
export type FormBindingRecord = typeof formBindings.$inferSelect;
export type InsertFormBindingRecord = typeof formBindings.$inferInsert;
export type FormSubmissionRecord = typeof formSubmissions.$inferSelect;
export type InsertFormSubmissionRecord = typeof formSubmissions.$inferInsert;
export type FormSubmissionRevisionRecord = typeof formSubmissionRevisions.$inferSelect;
export type FormAttachmentRecord = typeof formAttachments.$inferSelect;
export type FormDomainEventRecord = typeof formDomainEvents.$inferSelect;
export type InsertFormDomainEventRecord = typeof formDomainEvents.$inferInsert;
