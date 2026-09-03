# Task 3 report — MySQL/TiDB recovery adapter

## Status

DONE_WITH_CONCERNS

## Files

- `server/recovery/databaseAdapter.ts` — safe `mysqldump`/`mysql` adapter, fixed inventory and invariant SQL, and transactional storage-key replacement.
- `server/recovery/databaseAdapter.test.ts` — injected process and connection tests; no database or network connection.
- `.superpowers/sdd/2026-08-30-backup-restore-proof/task-3-report.md` — this evidence record.

## TDD evidence

1. RED — created `databaseAdapter.test.ts` before production code and ran `corepack pnpm vitest run --config vitest.config.ts server/recovery/databaseAdapter.test.ts`.
   - Result: failed while loading `./databaseAdapter`; `MysqlCliRecoveryAdapter` did not exist, as expected.
2. GREEN — added the minimal adapter implementation and reran the focused command.
   - Result: 1 file passed, 7 tests passed.
3. RED — removed `LC_ALL` from the parent environment and asserted that the child environment omits it rather than passing an undefined value.
   - Result: 1 file failed, 1 of 8 tests failed because the child environment still had `LC_ALL`.
4. GREEN/REFACTOR — allowlisted only defined path/locale values, bounded redacted stderr after sanitization, formatted the two files, and reran the focused command.
   - Result: 1 file passed, 8 tests passed.

## Verification

| Command | Result |
| --- | --- |
| `corepack pnpm vitest run --config vitest.config.ts server/recovery/databaseAdapter.test.ts` | PASS — 1 file, 8 tests |
| `corepack pnpm check` | PASS — TypeScript completed with no diagnostics |
| `corepack pnpm security:check` | PASS in a clean source package with the pre-existing ignored `dist` artifact temporarily set aside — `Verificação de segurança aprovada: 3 migrações e 11 correções preservadas.` The original `dist` directory was restored afterward and is not part of this task or its commits. |
| `corepack pnpm test` | PASS — 64 files, 283 tests |
| `corepack pnpm test:all` | Unit portion PASS on its run — 64 files, 282 tests; integration portion blocked before collection because `DATABASE_URL`, `JWT_SECRET`, `LOCAL_AUTH_BOOTSTRAP_USERNAME`, and `LOCAL_AUTH_BOOTSTRAP_PASSWORD` are intentionally unavailable |
| `corepack pnpm exec prettier --check server/recovery/databaseAdapter.ts server/recovery/databaseAdapter.test.ts` | PASS |
| `git diff --check` | PASS |

## Self-review

- Commands use only fixed `mysqldump` and `mysql` binaries with `shell: false`.
- The child environment is allowlisted to process path/locale variables plus `MYSQL_PWD`; it does not inherit Forge or recovery-encryption variables.
- The password is not an argument, and child stderr is capped at 8 KiB and redacted before becoming a typed process error.
- Export writes child stdout to the chosen file; restore pipes the chosen SQL file to child stdin. Neither command executes `DROP`, `CREATE DATABASE`, or `mysqladmin`.
- Inventory/count/invariant SQL is fixed. Storage reference replacement uses parameterized values, one transaction, and a switch over only `incident_evidence` and `user_profiles`.
- The process and database boundaries are injected and asserted through observable command, stream, query, and transaction behavior.

## Commits

- `9514158 feat: add safe database recovery adapter`

## Risks and concerns

- A live MySQL/TiDB exercise is deliberately absent; D-005B owns disposable real-infrastructure proof.
- The integration suite requires credentials that were not supplied and must not be fabricated for this task.

## Correction round 1/5

1. RED — added assertions that `--no-defaults` and `--no-login-paths` are the first two arguments for both `mysqldump` and `mysql`.
   - Command: `corepack pnpm vitest run --config vitest.config.ts server/recovery/databaseAdapter.test.ts`
   - Result: 2 tests failed because both clients began with `--protocol=TCP`.
   - GREEN: added the two client-isolation options in the required leading positions; 8 focused tests passed.
2. RED — added a dash-prefixed schema test that must follow `--`, plus a malformed decoded schema rejection.
   - Command: `corepack pnpm vitest run --config vitest.config.ts server/recovery/databaseAdapter.test.ts`
   - Result: 1 test failed because `--no-tablespaces` immediately preceded the dash-prefixed database argument.
   - GREEN: inserted `--` before the positional schema for both clients and reject empty, overlong, path-like, NUL, CR, and LF schema names; 9 focused tests passed.
3. RED — added the transaction-failure regression test and temporarily removed `rollback()` using `apply_patch` to prove the test detects it.
   - Command: `corepack pnpm vitest run --config vitest.config.ts server/recovery/databaseAdapter.test.ts`
   - Result: 1 test failed with lifecycle `[begin, end]` instead of `[begin, rollback, end]`.
   - GREEN: restored the required rollback; 10 focused tests passed.
4. RED — added a restore-source failure test that requires stdin destruction and child termination.
   - Command: `corepack pnpm vitest run --config vitest.config.ts server/recovery/databaseAdapter.test.ts`
   - Result: 1 test failed because the child `kill()` spy was called 0 times.
   - GREEN: close stdin and terminate the child before propagating a restore pipeline failure; 11 focused tests passed.

### Correction verification

| Command | Result |
| --- | --- |
| `corepack pnpm vitest run --config vitest.config.ts server/recovery/databaseAdapter.test.ts` | PASS — 1 file, 11 tests |
| `corepack pnpm check` | PASS — TypeScript completed with no diagnostics |
| `corepack pnpm security:check` | PASS in a temporarily clean source package; the ignored `dist` directory was restored after the check and remains outside the commit |
| `corepack pnpm test` | PASS — 64 files, 286 tests |
| `corepack pnpm exec prettier --write server/recovery/databaseAdapter.ts server/recovery/databaseAdapter.test.ts` | PASS — no format changes required |
| `git diff --check` | PASS |

Correction source commit: `88ef7ea fix: isolate recovery database clients`.
