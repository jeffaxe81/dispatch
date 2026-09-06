import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../drizzle/0006_d008_no_code_forms.sql", import.meta.url), "utf8");

describe("D-008 persistence contract", () => {
  it("mantém exatamente as sete tabelas aprovadas", () => {
    expect(migration).toContain("CREATE TABLE `form_templates`");
    expect(migration).toContain("CREATE TABLE `form_versions`");
    expect(migration).toContain("CREATE TABLE `form_bindings`");
    expect(migration).toContain("CREATE TABLE `form_submissions`");
    expect(migration).toContain("CREATE TABLE `form_submission_revisions`");
    expect(migration).toContain("CREATE TABLE `form_attachments`");
    expect(migration).toContain("CREATE TABLE `form_domain_events`");
    expect(migration).not.toContain("CREATE TABLE `forms`");
  });

  it("usa os estados de ciclo de vida aprovados", () => {
    expect(migration).toContain("enum('draft','active','disabled')");
    expect(migration).toContain("enum('draft','published','retired')");
    expect(migration).toContain("enum('in_progress','submitted','corrected')");
  });

  it("isola registros por tenant e fixa a versão usada na submissão", () => {
    expect(migration).toContain("`tenant_id` int NOT NULL");
    expect(migration).toContain("`form_version_id` int NOT NULL");
    expect(migration).toContain("form_versions_form_version_unique");
    expect(migration).toContain("form_submissions_tenant_version_idx");
  });

  it("preserva integração operacional pelos contextos aprovados", () => {
    expect(migration).toContain("`context_type` enum('incident_category','incident','field_activity')");
    expect(migration).toContain("`context_id` varchar(180)");
    expect(migration).toContain("form_bindings_tenant_context_idx");
  });

  it("mantém anexos fora do JSON com tipo explícito e SHA-256 obrigatório", () => {
    expect(migration).toContain("`kind` enum('image','file','simple_signature') NOT NULL");
    expect(migration).toContain("`storage_key` varchar(512) NOT NULL");
    expect(migration).toContain("`sha256` varchar(64) NOT NULL");
    expect(migration).toContain("`mime_type` varchar(160) NOT NULL");
  });

  it("persiste somente os cinco eventos aprovados em outbox retryable", () => {
    expect(migration).toContain("enum('form.published','submission.started','submission.submitted','submission.corrected','form.disabled')");
    expect(migration).toContain("`delivery_status` enum('pending','published','failed')");
    expect(migration).toContain("`attempt_count` int NOT NULL DEFAULT 0");
    expect(migration).toContain("`next_attempt_at` timestamp");
    expect(migration).toContain("form_domain_events_delivery_idx");
  });
});
