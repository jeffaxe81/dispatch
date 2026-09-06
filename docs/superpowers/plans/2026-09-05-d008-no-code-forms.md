# D-008 No-Code Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reusable, tenant-aware No-Code Forms engine integrated first with Occurrences and field activities, with immutable published versions, audited submissions/revisions, attachments, RBAC, and domain events.

**Architecture:** Use the approved hybrid model: relational metadata and operational links in MySQL/Drizzle, immutable versioned JSON schemas for designer definitions, and version-aware JSON answers with selected relational indexes. Keep the form domain isolated from incident state transitions and expose it through focused services plus a `forms` tRPC router; UI uses the same schema contract in the designer and runtime.

**Tech Stack:** TypeScript 5.9.3, React 19, Vite 7, tRPC 11, Zod 4, Drizzle ORM 0.45/MySQL, Vitest 2, existing Radix/UI components and storage helpers.

**Spec:** `docs/superpowers/specs/2026-09-05-d008-no-code-forms-design.md`

## Global Constraints

- Published form versions are immutable; edits after publication create a new version.
- Historical submissions remain tied to the exact published version used to render them.
- First operational integrations are Occurrences and Orders/Field Activities; do not couple the engine to a single consumer.
- ICP-Brasil remains a separate future module; simple drawn signature is evidence only.
- D-008 must not automatically perform critical Dispatch state transitions.
- Reuse the existing authentication, dynamic RBAC, audit, organization/team scope and storage patterns.
- Full offline synchronization, complex conditional logic, advanced formulas, OCR/AI, advanced workflow automation and ICP-Brasil signing stay in Product Backlog without deadline.
- Database work is limited to versioned schema/migration artifacts; do not apply migrations to a real database without explicit authorization.
- Do not create automatic production grants.
- Do not merge to `main` without explicit approval after all gates are GREEN.
- Preserve checkpoint `checkpoint/pre-d008-forms-20260905`.

---

## File Structure

New focused files:

- `shared/forms.ts` — canonical field/schema/submission contracts and Zod validation.
- `drizzle/formsSchema.ts` — form-specific relational tables/types, separate from the already-large `drizzle/schema.ts`.
- `drizzle/0006_d008_no_code_forms.sql` — migration artifact only.
- `server/forms/formDomain.ts` — publication/submission/revision invariants, pure and unit-testable.
- `server/forms/formRepository.ts` — Drizzle persistence adapter and transaction boundaries.
- `server/forms/formService.ts` — application orchestration, audit/event calls and tenant/scope checks.
- `server/forms/formAttachments.ts` — attachment policy, hashing and storage integration.
- `server/forms/formEvents.ts` — domain-event envelope and publication adapter.
- `server/forms/*.test.ts` — domain/service/attachment tests.
- `client/src/components/forms/FormRenderer.tsx` — runtime renderer used by operational surfaces.
- `client/src/components/forms/FormDesigner.tsx` — No-Code designer.
- `client/src/pages/FormsPage.tsx` — form catalog/administration.
- `client/src/pages/FormDesignerPage.tsx` — edit/version/publish page.
- `client/src/pages/FormsPage.test.tsx`, `client/src/components/forms/*.test.tsx` — UI contracts.

Existing files changed only at integration seams:

- `drizzle/meta/_journal.json` — register migration index 6.
- `server/accessControl.ts` and its tests — legacy fallback permissions for form capabilities while dynamic RBAC remains authoritative when assignments exist.
- `server/routers.ts` — mount the focused `forms` API and Zod inputs.
- `server/db.ts` — only minimal exports/helpers if repository access cannot remain entirely in `server/forms/formRepository.ts`; do not add another large form subsystem to this file.
- `client/src/App.tsx` — routes.
- `client/src/components/DashboardLayout.tsx` and tests — permission-gated Forms menu.
- `client/src/pages/IncidentDetailPage.tsx` — occurrence form status/runtime integration.
- `client/src/pages/AgentPage.tsx` — field-agent form runtime for active assignment.
- `scripts/security-regression-check.mjs` — add D-008 migration/security invariants without weakening existing checks.

---

### Task 1: Canonical Form Schema Contract

**Files:**
- Create: `shared/forms.ts`
- Test: `server/forms/formSchema.test.ts`

**Interfaces:**
- Produces: `FORM_FIELD_TYPES`, `FormFieldType`, `FormFieldDefinition`, `FormSchemaDefinition`, `formSchemaDefinitionSchema`, `formAnswersSchema`, `validateFormAnswers(schema, answers)`.
- Consumes: Zod only; no database or UI dependencies.

- [ ] **Step 1: Write failing contract tests**

Create `server/forms/formSchema.test.ts` with cases that assert: every approved initial component type parses; duplicate field keys fail; required fields reject missing/blank answers; single/multiple choice answers must use configured options; number/currency/date/date-time/yes-no/checkbox values have typed validation; section/instruction components never require answer values; unknown answer keys are rejected.

Use a representative schema:

```ts
const schema = {
  schemaVersion: 1,
  title: "Atendimento de iluminação",
  fields: [
    { id: "f1", key: "protocolo", type: "short_text", label: "Protocolo", required: true, maxLength: 40 },
    { id: "f2", key: "risco", type: "single_choice", label: "Risco", required: true, options: [{ value: "baixo", label: "Baixo" }, { value: "alto", label: "Alto" }] },
    { id: "f3", key: "foto", type: "image", label: "Foto", required: false },
  ],
} as const;
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run --config vitest.config.ts server/forms/formSchema.test.ts`
Expected: FAIL because `shared/forms.ts` does not exist.

- [ ] **Step 3: Implement the minimal shared contract**

Define these exact field type values:

```ts
export const FORM_FIELD_TYPES = [
  "short_text", "long_text", "number", "currency", "date", "time", "date_time",
  "single_choice", "multiple_choice", "checkbox", "yes_no", "address", "geolocation",
  "image", "file", "simple_signature", "calculated", "section", "instruction",
] as const;
```

Use a discriminated Zod union for field definitions. Every answer-bearing field has stable `id`, `key`, `label`, `required`; option fields own immutable `{value,label}` options; section/instruction are display-only. `validateFormAnswers` must return `{ success: true; data } | { success: false; issues }` and must never mutate the schema.

- [ ] **Step 4: Run focused tests GREEN**

Run the command from Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/forms.ts server/forms/formSchema.test.ts
git commit -m "feat: define D-008 form schema contract"
```

---

### Task 2: Relational Persistence and Migration Artifact

**Files:**
- Create: `drizzle/formsSchema.ts`
- Create: `drizzle/0006_d008_no_code_forms.sql`
- Modify: `drizzle/meta/_journal.json`
- Test: `server/forms/formsSchema.test.ts`

**Interfaces:**
- Produces tables: `formTemplates`, `formVersions`, `formBindings`, `formSubmissions`, `formSubmissionRevisions`, `formAttachments`, `formDomainEvents`.
- Tenant identity uses existing `organizations.id`; user/team/incident FKs use existing tables.

- [ ] **Step 1: Write failing schema/migration tests**

Assert source-level and Drizzle metadata invariants: all seven tables exist; `form_versions` has unique `(form_template_id, version_number)`; `form_submissions` references `form_version_id`; revisions reference submissions with `ON DELETE restrict`; tenant/org indexes exist; published schema JSON is stored only on `form_versions`; attachment metadata includes SHA-256; journal entry has `idx: 6`, `tag: "0006_d008_no_code_forms"`.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run --config vitest.config.ts server/forms/formsSchema.test.ts`
Expected: FAIL because the schema/migration is absent.

- [ ] **Step 3: Implement Drizzle tables**

Use enums/statuses:

```ts
formTemplateStatus: "draft" | "active" | "disabled"
formVersionStatus: "draft" | "published" | "retired"
formBindingType: "incident_category" | "incident" | "field_activity"
formSubmissionStatus: "in_progress" | "submitted" | "corrected"
formAttachmentKind: "image" | "file" | "simple_signature"
formEventType: "form.published" | "submission.started" | "submission.submitted" | "submission.corrected" | "form.disabled"
```

Store `schemaJson` on versions, `answersJson` on submissions/revisions, `tenantId`, actor IDs, team/incident links, timestamps and `version`/optimistic concurrency where edits occur. Use restrictive deletes for historical evidence.

- [ ] **Step 4: Create migration 0006 and journal entry**

Write SQL matching the Drizzle model and the existing `--> statement-breakpoint` convention. Do **not** run `pnpm db:push` or connect to a real database. Append journal index 6 after D-007D.

- [ ] **Step 5: Run schema tests GREEN and TypeScript check**

Run:
`pnpm vitest run --config vitest.config.ts server/forms/formsSchema.test.ts`
`pnpm check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add drizzle/formsSchema.ts drizzle/0006_d008_no_code_forms.sql drizzle/meta/_journal.json server/forms/formsSchema.test.ts
git commit -m "feat: add D-008 form persistence model"
```

---

### Task 3: Publication and Revision Domain Rules

**Files:**
- Create: `server/forms/formDomain.ts`
- Test: `server/forms/formDomain.test.ts`

**Interfaces:**
- Produces: `assertDraftVersionEditable(status)`, `nextVersionNumber(existing)`, `buildPublishedVersion(draft, actorUserId, now)`, `buildSubmissionRevision(current, correctedAnswers, reason, actorUserId, now)`.
- Consumes: types from `shared/forms.ts`.

- [ ] **Step 1: Write failing invariant tests**

Cover: draft editable; published/retired immutable; next version increments monotonically; publish freezes an exact schema snapshot and records actor/time; correction requires non-empty reason; correction never changes original answers; revision increments revision number and preserves submission/version IDs.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run --config vitest.config.ts server/forms/formDomain.test.ts`
Expected: FAIL due to missing domain module.

- [ ] **Step 3: Implement pure domain functions**

Return new objects rather than mutating inputs. Throw typed/domain errors with stable codes `FORM_VERSION_IMMUTABLE`, `CORRECTION_REASON_REQUIRED`, `FORM_SCHEMA_INVALID` so the router can map them consistently.

- [ ] **Step 4: Run GREEN**

Run focused test; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add server/forms/formDomain.ts server/forms/formDomain.test.ts
git commit -m "feat: enforce form publication and revision rules"
```

---

### Task 4: Repository, Tenant Scope and RBAC Capabilities

**Files:**
- Create: `server/forms/formRepository.ts`
- Create: `server/forms/formAccess.ts`
- Test: `server/forms/formAccess.test.ts`
- Modify: `server/accessControl.ts`
- Modify: `server/accessControl.test.ts`

**Interfaces:**
- Produces permissions: `forms.view`, `forms.fill`, `forms.create`, `forms.edit`, `forms.publish`, `forms.disable`, `forms.responses.view`, `forms.responses.correct`, `forms.export`, `forms.manage`.
- Produces repository methods `getTemplate`, `listTemplates`, `getVersion`, `createDraft`, `saveDraft`, `publishVersion`, `createSubmission`, `appendRevision`, `listBindings`, `listSubmissionsForIncident`.

- [ ] **Step 1: Add failing RBAC/scope tests**

Verify dynamic assignments remain authoritative; legacy administrator receives all form permissions; supervisor gets view/fill/responses view/correct but not publish/manage; dispatcher/operator get view/fill according to operational need; agent gets fill/view only within own assigned team/incident context. Verify a tenant/org mismatch is denied even when the permission code is present.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run --config vitest.config.ts server/forms/formAccess.test.ts server/accessControl.test.ts`
Expected: FAIL for missing permissions/access module.

- [ ] **Step 3: Implement access helpers and legacy fallback additions**

`formAccess.ts` must combine `assertPermission` with organization/team/incident scope. Do not duplicate password/session logic. Keep dynamic role behavior unchanged: when assignments exist, only explicitly assigned dynamic permissions count.

- [ ] **Step 4: Implement repository with tenant predicates on every read/write**

Every repository method accepts `tenantId`; queries include tenant constraints. Submission access also constrains incident/team when present. Use transactions for publish and correction so version/audit/event rows cannot partially commit.

- [ ] **Step 5: Run GREEN**

Run focused tests and `pnpm check`.

- [ ] **Step 6: Commit**

```bash
git add server/forms/formRepository.ts server/forms/formAccess.ts server/forms/formAccess.test.ts server/accessControl.ts server/accessControl.test.ts
git commit -m "feat: secure D-008 forms with RBAC and tenant scope"
```

---

### Task 5: Form Application Service, Audit and Domain Events

**Files:**
- Create: `server/forms/formEvents.ts`
- Create: `server/forms/formService.ts`
- Test: `server/forms/formService.test.ts`

**Interfaces:**
- Produces service methods `createFormDraft`, `updateFormDraft`, `publishFormVersion`, `disableForm`, `startSubmission`, `submitForm`, `correctSubmission`, `bindForm`, `getIncidentFormState`.
- Produces event envelope `{ eventId, eventType, tenantId, aggregateType, aggregateId, occurredAt, actorUserId, payload }`.

- [ ] **Step 1: Write failing orchestration tests**

Test publication creates immutable version + audit + `form.published`; submission validates against exact version and creates audit + event; invalid answers persist nothing; correction writes revision and `submission.corrected`; disabling preserves historical data; binding does not transition incident status; event publication failure after persistence is represented as pending/retryable domain-event state rather than rolling back confirmed submission.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run --config vitest.config.ts server/forms/formService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement event outbox adapter**

Persist domain events in `form_domain_events` with `pending/published/failed` delivery status and retry metadata. This is the seam for the future Motor de Eventos; D-008 remains functional without an external consumer.

- [ ] **Step 4: Implement service orchestration**

Validate schema/answers through `shared/forms.ts`, enforce domain invariants, call repository transactions, write existing `audit_logs` entries with resource types `form_template`, `form_version`, `form_submission`, and enqueue domain events. Never call incident transition functions from this service.

- [ ] **Step 5: Run GREEN**

Focused tests + `pnpm check`.

- [ ] **Step 6: Commit**

```bash
git add server/forms/formEvents.ts server/forms/formService.ts server/forms/formService.test.ts
git commit -m "feat: add audited form application service and events"
```

---

### Task 6: Attachment Policy and Integrity

**Files:**
- Create: `server/forms/formAttachments.ts`
- Test: `server/forms/formAttachments.test.ts`

**Interfaces:**
- Produces `FORM_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024`, `FORM_ATTACHMENT_TYPES`, `validateFormAttachment`, `storeFormAttachment`.
- Consumes existing `storagePut` from `server/storage.ts`.

- [ ] **Step 1: Write failing attachment tests**

Allow JPEG, PNG, WEBP and PDF up to 8 MiB; reject empty payload, oversized files, unsupported MIME and mismatched field kind; compute deterministic SHA-256 from decoded bytes; storage key must be tenant/submission scoped and sanitized; simple signature accepts PNG only in this release.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run --config vitest.config.ts server/forms/formAttachments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement validation/hash/storage adapter**

Decode Base64 once, validate actual byte count, hash with Node `crypto.createHash("sha256")`, call `storagePut`, return `{ storageKey, contentType, byteSize, sha256 }`. Keep a malware-scanning hook interface `scan(bytes, contentType)` whose default is a no-op marked by capability state, not a false claim that scanning occurred.

- [ ] **Step 4: Run GREEN**

Focused tests + `pnpm check`.

- [ ] **Step 5: Commit**

```bash
git add server/forms/formAttachments.ts server/forms/formAttachments.test.ts
git commit -m "feat: protect D-008 form attachments"
```

---

### Task 7: tRPC Forms API

**Files:**
- Modify: `server/routers.ts`
- Create: `server/forms/formsRouter.test.ts`

**Interfaces:**
- Produces `appRouter.forms` with `list`, `get`, `createDraft`, `updateDraft`, `publish`, `disable`, `bindings.bind`, `bindings.forIncident`, `submissions.start`, `submissions.submit`, `submissions.correct`, `submissions.forIncident`, `attachments.upload`.
- Consumes form service/access modules.

- [ ] **Step 1: Write failing router contract tests**

Assert protected access, Zod limits, permission calls, tenant derived from authorized organization context rather than arbitrary client trust, immutable publish errors mapped to `BAD_REQUEST/CONFLICT`, forbidden scope mapped to `FORBIDDEN`, attachment limits enforced server-side.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run --config vitest.config.ts server/forms/formsRouter.test.ts`
Expected: FAIL because router is not mounted.

- [ ] **Step 3: Mount focused forms router**

Keep schemas near the forms router integration and delegate business logic to `formService`; `server/routers.ts` should only validate, authorize context and map results/errors.

- [ ] **Step 4: Run GREEN**

Focused tests + `pnpm check`.

- [ ] **Step 5: Commit**

```bash
git add server/routers.ts server/forms/formsRouter.test.ts
git commit -m "feat: expose D-008 forms API"
```

---

### Task 8: Runtime Form Renderer

**Files:**
- Create: `client/src/components/forms/FormRenderer.tsx`
- Test: `client/src/components/forms/FormRenderer.test.tsx`

**Interfaces:**
- Produces `<FormRenderer schema answers onChange readOnly errors />`.
- Consumes `FormSchemaDefinition` from `shared/forms.ts` and existing UI primitives.

- [ ] **Step 1: Write failing renderer tests**

Render each approved initial component; verify labels/required markers; answer changes use stable field keys; display-only components do not enter answers; invalid field errors are associated accessibly; read-only mode cannot change answers; simple signature is labeled `Assinatura simples — não ICP-Brasil`.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run --config vitest.config.ts client/src/components/forms/FormRenderer.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement renderer by small field components**

Keep type switch exhaustive. Use existing Input/Textarea/Select/Checkbox components. For geolocation expose latitude/longitude inputs plus optional browser capture action; do not introduce offline sync. For calculated fields support only deterministic basic operations explicitly represented in schema.

- [ ] **Step 4: Run GREEN**

Focused test + `pnpm check`.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/forms/FormRenderer.tsx client/src/components/forms/FormRenderer.test.tsx
git commit -m "feat: render D-008 dynamic forms"
```

---

### Task 9: No-Code Designer and Publication UI

**Files:**
- Create: `client/src/components/forms/FormDesigner.tsx`
- Create: `client/src/components/forms/FormDesigner.test.tsx`
- Create: `client/src/pages/FormsPage.tsx`
- Create: `client/src/pages/FormDesignerPage.tsx`
- Create: `client/src/pages/FormsPage.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/DashboardLayout.tsx`
- Modify: `client/src/components/DashboardLayout.test.ts`

**Interfaces:**
- Routes: `/formularios`, `/formularios/:id`.
- Menu requires `forms.view`; create/edit/publish controls require their specific permissions.

- [ ] **Step 1: Write failing navigation/catalog tests**

Verify menu appears only with `forms.view`; routes resolve; catalog shows status/version; users without create/publish permissions do not see those actions.

- [ ] **Step 2: Write failing designer tests**

Verify add/remove/reorder fields, edit label/key/required/options/limits, schema preview, validation before save/publish, published version is read-only and offers `Criar nova versão` rather than edit-in-place.

- [ ] **Step 3: Run RED**

Run the three focused UI test files; expected FAIL.

- [ ] **Step 4: Implement catalog and designer**

Use a three-area responsive layout: component palette, form canvas, selected-field properties. On narrow screens stack them. Do not add complex conditional-rule builder, OCR, AI generation or advanced workflow controls.

- [ ] **Step 5: Wire routes/menu and run GREEN**

Run focused tests + `pnpm check`.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/forms client/src/pages/FormsPage.tsx client/src/pages/FormDesignerPage.tsx client/src/pages/FormsPage.test.tsx client/src/App.tsx client/src/components/DashboardLayout.tsx client/src/components/DashboardLayout.test.ts
git commit -m "feat: add D-008 no-code form designer"
```

---

### Task 10: Occurrence and Field-Agent Integration

**Files:**
- Modify: `client/src/pages/IncidentDetailPage.tsx`
- Modify: `client/src/pages/AgentPage.tsx`
- Modify: `client/src/pages/AgentPage.test.tsx`
- Create: `client/src/pages/IncidentForms.integration.test.tsx`
- Test/modify relevant server incident tests only where the new read integration is exercised.

**Interfaces:**
- Consumes `forms.bindings.forIncident`, `forms.submissions.forIncident`, `forms.submissions.start/submit`.
- Does not consume `incidents.transition` from the form service.

- [ ] **Step 1: Write failing integration tests**

Occurrence detail shows required forms and states `Não iniciado`, `Em preenchimento`, `Enviado`, `Corrigido`; agent sees only forms bound to active own-team assignment; successful form submit refreshes form state/timeline but does not call incident transition; unauthorized agent cannot load another team's form.

- [ ] **Step 2: Run RED**

Run focused incident/agent tests; expected FAIL.

- [ ] **Step 3: Implement occurrence panel**

Add a `Formulários do atendimento` card to occurrence detail using `FormRenderer` in view/fill mode according to permissions. Keep existing dispatch/NEO behavior unchanged.

- [ ] **Step 4: Implement agent runtime**

For the active assignment, show required forms before/alongside evidence. Persist in-progress state only through D-008 submission APIs. Do not block or auto-trigger an incident status change unless an existing explicit user action does so independently.

- [ ] **Step 5: Run GREEN**

Focused tests + `pnpm check`.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/IncidentDetailPage.tsx client/src/pages/AgentPage.tsx client/src/pages/AgentPage.test.tsx client/src/pages/IncidentForms.integration.test.tsx
git commit -m "feat: integrate D-008 forms with dispatch operations"
```

---

### Task 11: Security Gate, Regression Suite and Delivery Evidence

**Files:**
- Modify: `scripts/security-regression-check.mjs`
- Create: `docs/releases/d008-no-code-forms-verification.md`
- Modify only tests/config proven necessary by failures; no opportunistic refactors.

**Interfaces:**
- Produces auditable verification evidence; no production deployment.

- [ ] **Step 1: Extend security regression assertions before changing implementation**

Assert migration `0006_d008_no_code_forms` is present, historical form tables use restrictive deletes, tenant indexes exist, published versions are immutable by service contract, form permissions exist, upload limits/MIME/hash checks exist, and no form service imports/calls incident transition functions.

- [ ] **Step 2: Run the complete quality sequence**

Run exactly:

```bash
pnpm security:check
pnpm check
pnpm test
pnpm build
```

Expected: all commands exit 0. Record actual test-file/test counts and build warnings; do not predict or fabricate counts.

- [ ] **Step 3: Run existing visual/compatibility gates when available in the branch CI**

Run/verify the same repository workflows used for v2.16.0: GIS visual homologation, NEO external compatibility and NEO workspace visual homologation. D-008 must not regress these surfaces.

- [ ] **Step 4: Write verification report**

Record commit SHA, migration artifact status `versioned only / not applied to real DB`, exact commands/results, warnings, backlog items, and confirmation: no deploy, no real DB migration, no automatic grants.

- [ ] **Step 5: Commit evidence**

```bash
git add scripts/security-regression-check.mjs docs/releases/d008-no-code-forms-verification.md
git commit -m "test: verify D-008 no-code forms release candidate"
```

- [ ] **Step 6: Create draft PR only after local/CI evidence is GREEN**

Head: `feature/d008-no-code-forms`
Base: `main`
Title: `D-008 — Formulários Dinâmicos / No-Code`

PR checklist must include architecture/spec, migration-not-applied statement, RBAC/tenant isolation, immutable versioning, attachments/hash, occurrence/agent integration, test counts, build, security, GIS/NEO regression gates and explicit merge approval gate.

---

## Self-Review Result

- Spec coverage: objectives, hybrid architecture, immutable publication, initial component catalog, submissions/revisions, attachments, operational integration, events, RBAC, tenant scope, security, retention behavior, ICP separation, error handling and testing all map to explicit tasks.
- Scope: one bounded subsystem (D-008 Forms) with two integration surfaces; ICP, offline, AI/OCR and advanced workflow remain excluded.
- Placeholder scan: no implementation requirement depends on TBD/TODO placeholders.
- Type/interface consistency: stable field keys, tenant IDs, version IDs, submission/revision identities and permission codes are defined before consumers.
- Safety: migration remains an artifact only; no deploy, real migration, production grant or `main` merge is authorized by this plan.