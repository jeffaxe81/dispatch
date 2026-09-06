import { bigint, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import type { FormAnswers, FormSchemaDefinition } from "../shared/forms";
import { organizations, organizationalUnits, teams, users } from "./schema";

export const formStatusEnum = mysqlEnum("form_status", ["draft", "published", "inactive"]);
export const formVersionStatusEnum = mysqlEnum("form_version_status", ["draft", "published", "superseded"]);
export const formContextTypeEnum = mysqlEnum("form_context_type", ["occurrence", "field_order", "field_activity"]);
export const formSubmissionStatusEnum = mysqlEnum("form_submission_status", ["not_started", "filling", "submitted", "corrected"]);

export const forms = mysqlTable("forms", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => organizations.id),
  code: varchar("code", { length: 120 }).notNull(),
  name: varchar("name", { length: 240 }).notNull(),
  description: text("description"),
  status: formStatusEnum.notNull().default("draft"),
  organizationalUnitId: int("organizational_unit_id").references(() => organizationalUnits.id, { onDelete: "set null" }),
  createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("forms_tenant_code_unique").on(table.tenantId, table.code),
  index("forms_tenant_status_idx").on(table.tenantId, table.status),
]);

export const formVersions = mysqlTable("form_versions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => organizations.id),
  formId: int("form_id").notNull().references(() => forms.id, { onDelete: "restrict" }),
  version: int("version").notNull(),
  definition: json("definition").$type<FormSchemaDefinition>().notNull(),
  definitionHash: varchar("definition_hash", { length: 64 }).notNull(),
  status: formVersionStatusEnum.notNull().default("draft"),
  publishedByUserId: int("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at"),
  createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [
  uniqueIndex("form_versions_form_version_unique").on(table.formId, table.version),
  index("form_versions_tenant_form_status_idx").on(table.tenantId, table.formId, table.status),
]);

export const formSubmissions = mysqlTable("form_submissions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => organizations.id),
  formId: int("form_id").notNull().references(() => forms.id, { onDelete: "restrict" }),
  formVersionId: int("form_version_id").notNull().references(() => formVersions.id, { onDelete: "restrict" }),
  contextType: formContextTypeEnum,
  contextId: varchar("context_id", { length: 180 }),
  responsibleUserId: int("responsible_user_id").references(() => users.id, { onDelete: "set null" }),
  teamId: int("team_id").references(() => teams.id, { onDelete: "set null" }),
  status: formSubmissionStatusEnum.notNull().default("not_started"),
  answers: json("answers").$type<FormAnswers>().notNull(),
  location: json("location").$type<{ latitude: number; longitude: number } | null>(),
  submittedByUserId: int("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at"),
  createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("form_submissions_tenant_version_idx").on(table.tenantId, table.formVersionId, table.status),
  index("form_submissions_context_idx").on(table.tenantId, table.contextType, table.contextId),
]);

export const formSubmissionRevisions = mysqlTable("form_submission_revisions", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submission_id").notNull().references(() => formSubmissions.id, { onDelete: "restrict" }),
  tenantId: int("tenant_id").notNull().references(() => organizations.id),
  revision: int("revision").notNull(),
  answers: json("answers").$type<FormAnswers>().notNull(),
  reason: text("reason").notNull(),
  actorUserId: int("actor_user_id").notNull().references(() => users.id),
  beforeHash: varchar("before_hash", { length: 64 }),
  afterHash: varchar("after_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [
  uniqueIndex("form_submission_revisions_revision_unique").on(table.submissionId, table.revision),
  index("form_submission_revisions_submission_created_idx").on(table.submissionId, table.createdAt),
]);

export const formAttachments = mysqlTable("form_attachments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => organizations.id),
  submissionId: int("submission_id").notNull().references(() => formSubmissions.id, { onDelete: "restrict" }),
  revisionId: int("revision_id").references(() => formSubmissionRevisions.id, { onDelete: "set null" }),
  fieldKey: varchar("field_key", { length: 120 }).notNull(),
  storageKey: varchar("storage_key", { length: 512 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 160 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: varchar("sha256", { length: 64 }),
  createdByUserId: int("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [
  index("form_attachments_submission_field_idx").on(table.submissionId, table.fieldKey),
]);

export type FormRecord = typeof forms.$inferSelect;
export type InsertFormRecord = typeof forms.$inferInsert;
export type FormVersionRecord = typeof formVersions.$inferSelect;
export type InsertFormVersionRecord = typeof formVersions.$inferInsert;
export type FormSubmissionRecord = typeof formSubmissions.$inferSelect;
export type InsertFormSubmissionRecord = typeof formSubmissions.$inferInsert;
export type FormSubmissionRevisionRecord = typeof formSubmissionRevisions.$inferSelect;
export type FormAttachmentRecord = typeof formAttachments.$inferSelect;
