import { bigint, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import type { FormAnswers, FormSchemaDefinition } from "../shared/forms";
import { organizations, organizationalUnits, teams, users } from "./schema";

export const formStatusEnum = mysqlEnum("form_status", ["draft", "active", "disabled"]);
export const formVersionStatusEnum = mysqlEnum("form_version_status", ["draft", "published", "retired"]);
export const formContextTypeEnum = mysqlEnum("form_context_type", ["incident_category", "incident", "field_activity"]);
export const formSubmissionStatusEnum = mysqlEnum("form_submission_status", ["in_progress", "submitted", "corrected"]);
export const formAttachmentKindEnum = mysqlEnum("form_attachment_kind", ["image", "file", "simple_signature"]);
export const formEventTypeEnum = mysqlEnum("form_event_type", ["form.published", "submission.started", "submission.submitted", "submission.corrected", "form.disabled"]);
export const formEventAggregateTypeEnum = mysqlEnum("form_event_aggregate_type", ["form", "submission"]);
export const formEventDeliveryStatusEnum = mysqlEnum("form_event_delivery_status", ["pending", "published", "failed"]);

export const formTemplates = mysqlTable("form_templates", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenant_id").notNull().references(() => organizations.id), code: varchar("code", { length: 120 }).notNull(), name: varchar("name", { length: 240 }).notNull(), description: text("description"), status: formStatusEnum.notNull().default("draft"), organizationalUnitId: int("organizational_unit_id").references(() => organizationalUnits.id, { onDelete: "set null" }), createdByUserId: int("created_by_user_id").notNull().references(() => users.id), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("form_templates_tenant_code_unique").on(table.tenantId, table.code), index("form_templates_tenant_status_idx").on(table.tenantId, table.status)]);

export const formVersions = mysqlTable("form_versions", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenant_id").notNull().references(() => organizations.id), formId: int("form_id").notNull().references(() => formTemplates.id, { onDelete: "restrict" }), version: int("version").notNull(), definition: json("definition").$type<FormSchemaDefinition>().notNull(), definitionHash: varchar("definition_hash", { length: 64 }).notNull(), status: formVersionStatusEnum.notNull().default("draft"), publishedByUserId: int("published_by_user_id").references(() => users.id, { onDelete: "set null" }), publishedAt: timestamp("published_at"), createdByUserId: int("created_by_user_id").notNull().references(() => users.id), createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("form_versions_form_version_unique").on(table.formId, table.version), index("form_versions_tenant_form_status_idx").on(table.tenantId, table.formId, table.status)]);

export const formBindings = mysqlTable("form_bindings", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenant_id").notNull().references(() => organizations.id), formId: int("form_id").notNull().references(() => formTemplates.id, { onDelete: "restrict" }), formVersionId: int("form_version_id").notNull().references(() => formVersions.id, { onDelete: "restrict" }), contextType: formContextTypeEnum.notNull(), contextId: varchar("context_id", { length: 180 }).notNull(), responsibleUserId: int("responsible_user_id").references(() => users.id, { onDelete: "set null" }), teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }), createdByUserId: int("created_by_user_id").notNull().references(() => users.id), createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("form_bindings_tenant_context_idx").on(table.tenantId, table.contextType, table.contextId), index("form_bindings_tenant_form_idx").on(table.tenantId, table.formId, table.formVersionId)]);

export const formSubmissions = mysqlTable("form_submissions", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenant_id").notNull().references(() => organizations.id), formId: int("form_id").notNull().references(() => formTemplates.id, { onDelete: "restrict" }), formVersionId: int("form_version_id").notNull().references(() => formVersions.id, { onDelete: "restrict" }), contextType: formContextTypeEnum, contextId: varchar("context_id", { length: 180 }), responsibleUserId: int("responsible_user_id").references(() => users.id, { onDelete: "set null" }), teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }), status: formSubmissionStatusEnum.notNull().default("in_progress"), answers: json("answers").$type<FormAnswers>().notNull(), location: json("location").$type<{ latitude: number; longitude: number } | null>(), submittedByUserId: int("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }), submittedAt: timestamp("submitted_at"), createdByUserId: int("created_by_user_id").notNull().references(() => users.id), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [index("form_submissions_tenant_version_idx").on(table.tenantId, table.formVersionId, table.status), index("form_submissions_context_idx").on(table.tenantId, table.contextType, table.contextId)]);

export const formSubmissionRevisions = mysqlTable("form_submission_revisions", {
  id: int("id").autoincrement().primaryKey(), submissionId: int("submission_id").notNull().references(() => formSubmissions.id, { onDelete: "restrict" }), tenantId: int("tenant_id").notNull().references(() => organizations.id), revision: int("revision").notNull(), answers: json("answers").$type<FormAnswers>().notNull(), reason: text("reason").notNull(), actorUserId: int("actor_user_id").notNull().references(() => users.id), beforeHash: varchar("before_hash", { length: 64 }), afterHash: varchar("after_hash", { length: 64 }).notNull(), createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("form_submission_revisions_revision_unique").on(table.submissionId, table.revision), index("form_submission_revisions_submission_created_idx").on(table.submissionId, table.createdAt)]);

export const formAttachments = mysqlTable("form_attachments", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenant_id").notNull().references(() => organizations.id), submissionId: int("submission_id").notNull().references(() => formSubmissions.id, { onDelete: "restrict" }), revisionId: int("revision_id").references(() => formSubmissionRevisions.id, { onDelete: "set null" }), fieldKey: varchar("field_key", { length: 120 }).notNull(), kind: formAttachmentKindEnum.notNull(), storageKey: varchar("storage_key", { length: 512 }).notNull(), fileName: varchar("file_name", { length: 255 }).notNull(), mimeType: varchar("mime_type", { length: 160 }).notNull(), sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(), sha256: varchar("sha256", { length: 64 }).notNull(), createdByUserId: int("created_by_user_id").notNull().references(() => users.id), createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("form_attachments_submission_field_idx").on(table.submissionId, table.fieldKey)]);

export const formDomainEvents = mysqlTable("form_domain_events", {
  id: int("id").autoincrement().primaryKey(), eventId: varchar("event_id", { length: 180 }).notNull(), tenantId: int("tenant_id").notNull().references(() => organizations.id), eventType: formEventTypeEnum.notNull(), aggregateType: formEventAggregateTypeEnum.notNull(), aggregateId: varchar("aggregate_id", { length: 180 }).notNull(), actorUserId: int("actor_user_id").notNull().references(() => users.id), payload: json("payload").$type<Record<string, unknown>>().notNull(), occurredAt: timestamp("occurred_at").notNull(), deliveryStatus: formEventDeliveryStatusEnum.notNull().default("pending"), attemptCount: int("attempt_count").notNull().default(0), lastAttemptAt: timestamp("last_attempt_at"), nextAttemptAt: timestamp("next_attempt_at"), lastError: text("last_error"), publishedAt: timestamp("published_at"), createdAt: timestamp("created_at").defaultNow().notNull(),
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
