# D-012I I5C — fila manual de SLA em homologação

**Status:** implementation branch / PR Draft. This document is a runbook proposal, **not evidence of real-environment homologation**.

## Objective and controls

I5C makes the SLA intent queue observable in **manual** mode and allows a **limited lease probe** with MySQL CAS. It does **not** send notifications, mark events as delivered, reassign workflow tasks, edit incidents, start a cron/daemon, or expose HTTP/CLI entrypoints.

- Source: `server/workflow/workflowSlaManualCandidateMySql.ts` (read-only discovery; tenant and active task joins).
- Runner: `server/workflow/workflowSlaManualWorker.ts` (pure coordinator / manual gates).
- Composition root: `server/workflow/workflowSlaI5cHomologation.ts` (MySQL + trusted server clock).
- Existing CAS / state transitions are provided by I5A and I5B.
- `preview` performs **zero UPDATEs**. `lease_probe` **writes** real lease records and increases the attempt counter, so it must never be run on production or real operational SLA data.

## Feature gate (disabled unless explicitly enabled)

The internal call checks the process environment **before a DB connection** and **before each write**:

```dotenv
AXE_RUNTIME_ENV=homologation
AXE_SLA_I5C_ENABLED=true
```

Both are required. Production, missing values and other environment names fail closed. Do not configure these flags on a production service. There is no scheduler / route / public entrypoint wired by this PR.

## Manual session prerequisites

1. Use an isolated homologation deployment with a **homologation-only** MySQL instance and disposable test tenants, never production credentials or a replicated operational dataset that can be written.
2. Apply and validate migrations `0014`, `0015`, `0016` only after a separately authorized, recorded database change in the homologation instance. **This PR does not apply migrations.**
3. Authenticate an operations administrator with permission scoped to the requested `organizationId` in the upstream operator workflow. The `operatorApproved` boolean is merely an explicit confirmation of an **already completed** RBAC + change approval check; it does not implement authorization.
4. Select a bounded group of artificial overdue tasks. Use a unique `workerId` for attribution. No secrets, request bodies, messages, phone numbers or lease tokens go into reports.
5. Invoke `runWorkflowSlaI5cHomologationBatch` from a local, authenticated **internal** harness. The function takes `organizationId`, `limit` (1–20), `workerId`, `mode` and `operatorApproved`. It takes its UTC clock from the **server**.

## Expected behavior

| Mode | DB reads | DB writes | External events | What it proves |
|---|---:|---:|---:|---|
| `preview` | Yes | None | None | Bounded tenant-scoped discovery |
| `lease_probe` | Yes | Yes (CAS lease) | None | Competing workers cannot reserve the same version simultaneously |

The result contains only tenant, mode, candidate IDs, and aggregate `leased`, `contention`, `skipped` counters. It intentionally excludes lease tokens. Nothing here is an external delivery receipt.

Eligibility: tenant must match both ledger and execution tenant scope, workflow task must be `open` or `in_progress`, frozen version/node must match, scheduled time must have passed. Eligible states are `pending` with retry time reached, or `leased` with lease expired.

## Reconciliation / restart behavior

There is no in-memory cursor to recover: the database state is the checkpoint. An interrupted batch can be inspected again with `preview`, and expired leases become discoverable after their TTL. The CAS version blocks stale acknowledgments; a concurrent worker may cause a normal `contention` counter. A probe that was successfully reserved but not completed will expire after **60 seconds**; future attempts increment the attempt count and may move the record to `dead_letter` after the configured maximum (3 attempts). **No automatic DLQ replay or operator replay endpoint exists yet.** Reprocessing `dead_letter` requires a separate approved workflow to be designed in I5D; do not manually rewrite status/version columns.

## Required homologation / release gates

- Run focused tests (worker + candidate SQL + inherited I5A/I5B), TypeScript, security regression and full test/build pipelines on the exact PR head.
- Conduct actual concurrency tests against separate MySQL connections; no mock test proves distributed locking in the target database.
- Test tenant A/B access denial, completed/cancelled task exclusion, frozen metadata mismatch, UTC deadlines, lease expiration, process crash, operator gate shutdown and database outage.
- **Known race gate for I5D:** a task could close after candidate listing but before claim. The future event delivery adapter must re-check current task state and tenant scope atomically or via another approved consistency strategy before sending an external notification.
- Keep CI evidence, correlation IDs, migrations, deployment state, safety sign-off and GO/NO-GO in issue #123.

## Local commands (on a clone with dependencies)

```bash
corepack pnpm check
corepack pnpm exec vitest run --config vitest.config.ts server/workflow/workflowSlaManualWorker.test.ts server/workflow/workflowSlaManualCandidateMySql.test.ts
corepack pnpm test:all
corepack pnpm security:check
corepack pnpm build
```

**No deploy, migration, external send, automatic queue schedule or merge to `main` is authorized in this development step.**
