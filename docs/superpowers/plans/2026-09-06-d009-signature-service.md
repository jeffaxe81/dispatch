# D-009 Signature Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o novo serviço independente de assinatura digital/ICP-Brasil, com domínio agnóstico de fornecedor, isolamento por tenant, webhook seguro, evidência auditável e integração futura por API.

**Architecture:** O D-009 será implementado em repositório próprio, recomendado como `jeffaxe81/axesistemas-signature-service`. O `dispatch` não receberá a implementação do módulo; nele permanecerá apenas a especificação e, futuramente, o adaptador cliente. O serviço terá domínio isolado, portas para provider e persistência, contexto de tenant server-side e auditoria append-only.

**Tech Stack:** Node.js 24+, TypeScript, Fastify/Express, PostgreSQL, Drizzle ORM, Zod, Vitest, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-06-d009-signature-service-design.md`

## Global Constraints

- Implementação funcional somente no repositório independente do D-009.
- Nunca aceitar `tenantId` do payload como autoridade.
- Nunca armazenar chave privada de certificado.
- Primeiro provider deve ser fake/contractual; fornecedor real exige aprovação separada.
- TDD RED -> GREEN em todas as tarefas funcionais.
- PR Draft até security, TypeScript, testes e build GREEN.
- Merge somente com autorização explícita.
- Deploy, migration real, credenciais e grants são gates separados.

---

### Task 1: Bootstrap do repositório independente e CI

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/index.ts`
- Create: `src/app.ts`
- Create: `test/app.test.ts`
- Create: `.github/workflows/quality.yml`
- Create: `Dockerfile`
- Create: `README.md`

**Interfaces:**
- Consumes: nenhum código do Dispatch.
- Produces: `buildApp(): FastifyInstance | Express` e pipeline de CI mínimo.

- [ ] **Step 1: Write the failing smoke test**

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("signature service", () => {
  it("reports health", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm test -- test/app.test.ts`
Expected: FAIL because `src/app.ts` / `buildApp` does not exist.

- [ ] **Step 3: Implement the minimal application boundary**

```ts
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify();
  app.get("/health", async () => ({ status: "ok" }));
  return app;
}
```

- [ ] **Step 4: Run GREEN gates**

Run: `pnpm check && pnpm test && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: bootstrap signature service"
```

### Task 2: Tenant context fail-closed

**Files:**
- Create: `src/security/tenantContext.ts`
- Create: `src/security/tenantContext.test.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Consumes: authenticated service credential metadata.
- Produces: `resolveTenantContext(identity: AuthIdentity): TenantContext`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveTenantContext } from "./tenantContext";

describe("resolveTenantContext", () => {
  it("resolves exactly one server-authorized tenant", () => {
    expect(resolveTenantContext({ subject: "dispatch", authorizedTenants: ["tenant-a"] })).toEqual({ tenantId: "tenant-a", subject: "dispatch" });
  });

  it("fails closed for zero or multiple tenants", () => {
    expect(() => resolveTenantContext({ subject: "x", authorizedTenants: [] })).toThrow("TENANT_UNRESOLVED");
    expect(() => resolveTenantContext({ subject: "x", authorizedTenants: ["a", "b"] })).toThrow("TENANT_UNRESOLVED");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/security/tenantContext.test.ts`
Expected: FAIL because resolver does not exist.

- [ ] **Step 3: Implement minimal fail-closed resolver**

```ts
export type AuthIdentity = { subject: string; authorizedTenants: string[] };
export type TenantContext = { tenantId: string; subject: string };

export function resolveTenantContext(identity: AuthIdentity): TenantContext {
  const tenants = [...new Set(identity.authorizedTenants.filter(Boolean))];
  if (tenants.length !== 1) throw new Error("TENANT_UNRESOLVED");
  return { tenantId: tenants[0], subject: identity.subject };
}
```

- [ ] **Step 4: Run GREEN**

Run: `pnpm test -- src/security/tenantContext.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/security src/app.ts
git commit -m "feat: add fail-closed tenant context"
```

### Task 3: Domain model and state machine

**Files:**
- Create: `src/signatures/domain.ts`
- Create: `src/signatures/domain.test.ts`

**Interfaces:**
- Produces: `SignatureRequest`, `SignatureStatus`, `transitionSignatureStatus(current, next)`.

- [ ] **Step 1: Write failing transition tests**

```ts
import { describe, expect, it } from "vitest";
import { transitionSignatureStatus } from "./domain";

describe("signature lifecycle", () => {
  it("allows draft -> pending -> signed", () => {
    expect(transitionSignatureStatus("draft", "pending")).toBe("pending");
    expect(transitionSignatureStatus("pending", "signed")).toBe("signed");
  });

  it("rejects terminal-state mutation", () => {
    expect(() => transitionSignatureStatus("signed", "pending")).toThrow("INVALID_SIGNATURE_TRANSITION");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/signatures/domain.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement explicit transition table**

```ts
export type SignatureStatus = "draft" | "pending" | "signed" | "rejected" | "expired" | "failed";
const allowed: Record<SignatureStatus, SignatureStatus[]> = {
  draft: ["pending", "failed"],
  pending: ["signed", "rejected", "expired", "failed"],
  signed: [], rejected: [], expired: [], failed: [],
};
export function transitionSignatureStatus(current: SignatureStatus, next: SignatureStatus) {
  if (!allowed[current].includes(next)) throw new Error("INVALID_SIGNATURE_TRANSITION");
  return next;
}
```

- [ ] **Step 4: Run GREEN**

Run: `pnpm test -- src/signatures/domain.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/signatures/domain*
git commit -m "feat: add signature lifecycle domain"
```

### Task 4: Document hashing and storage contract

**Files:**
- Create: `src/documents/documentHash.ts`
- Create: `src/documents/documentHash.test.ts`
- Create: `src/documents/documentStore.ts`

**Interfaces:**
- Produces: `sha256(buffer: Buffer): string` and `DocumentStore` port.

- [ ] **Step 1: Write failing SHA-256 test**

```ts
import { describe, expect, it } from "vitest";
import { sha256 } from "./documentHash";

it("hashes document bytes deterministically", () => {
  expect(sha256(Buffer.from("axe"))).toBe("cda2e7f0f7f98e30b3a0f93f33d4fbd10e0ac59131b3bea8e6f6282f632b0a47");
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/documents/documentHash.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement SHA-256 with Node crypto**

```ts
import { createHash } from "node:crypto";
export const sha256 = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
```

- [ ] **Step 4: Run GREEN**

Run: `pnpm test -- src/documents/documentHash.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/documents
git commit -m "feat: add document integrity hashing"
```

### Task 5: Provider port and fake provider

**Files:**
- Create: `src/providers/signatureProvider.ts`
- Create: `src/providers/fakeSignatureProvider.ts`
- Create: `src/providers/fakeSignatureProvider.test.ts`

**Interfaces:**
- Produces: `SignatureProvider.createRequest(input)`, `SignatureProvider.cancelRequest(id)` and fake deterministic implementation.

- [ ] **Step 1: Write failing provider contract test**

```ts
import { describe, expect, it } from "vitest";
import { FakeSignatureProvider } from "./fakeSignatureProvider";

it("returns a provider request id without external I/O", async () => {
  const provider = new FakeSignatureProvider();
  await expect(provider.createRequest({ requestId: "req-1", documentSha256: "abc" })).resolves.toEqual({ providerRequestId: "fake:req-1" });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/providers/fakeSignatureProvider.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement interface and fake provider**

```ts
export interface SignatureProvider {
  createRequest(input: { requestId: string; documentSha256: string }): Promise<{ providerRequestId: string }>;
  cancelRequest(providerRequestId: string): Promise<void>;
}
```

- [ ] **Step 4: Run GREEN**

Run: `pnpm test -- src/providers/fakeSignatureProvider.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers
git commit -m "feat: define provider contract and fake adapter"
```

### Task 6: Persistence schema and repository

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/signatureRepository.ts`
- Create: `src/db/signatureRepository.test.ts`
- Create: `drizzle.config.ts`

**Interfaces:**
- Produces: tenant-scoped `SignatureRepository` methods: `create`, `findById`, `updateStatus`, `appendEvidence`.

- [ ] **Step 1: Write repository tenant-isolation test**

```ts
it("never resolves a request across tenants", async () => {
  await repo.create("tenant-a", fixture);
  await expect(repo.findById("tenant-b", fixture.id)).resolves.toBeNull();
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/db/signatureRepository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement repository with tenant in every predicate**

All queries must use both `id` and `tenant_id`. No `findById(id)` overload is allowed.

- [ ] **Step 4: Run GREEN**

Run: `pnpm test -- src/db/signatureRepository.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db drizzle.config.ts
git commit -m "feat: add tenant-scoped signature persistence"
```

### Task 7: SignatureService orchestration

**Files:**
- Create: `src/signatures/signatureService.ts`
- Create: `src/signatures/signatureService.test.ts`

**Interfaces:**
- Consumes: tenant context, repository, document store/hash, provider.
- Produces: `createSignatureRequest`, `getSignatureRequest`, `cancelSignatureRequest`.

- [ ] **Step 1: Write failing orchestration test**

```ts
it("hashes the closed document before sending it to the provider", async () => {
  const result = await service.createSignatureRequest(ctx, { document: Buffer.from("doc"), signer: { name: "Ana" } });
  expect(provider.lastCreate?.documentSha256).toBe(result.documentSha256);
  expect(result.status).toBe("pending");
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/signatures/signatureService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement minimal orchestration**

Create domain request as `draft`, persist, call provider, persist `providerRequestId`, transition to `pending`, append audit event.

- [ ] **Step 4: Run GREEN**

Run: `pnpm test -- src/signatures/signatureService.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/signatures
git commit -m "feat: orchestrate signature requests"
```

### Task 8: Secure idempotent webhook

**Files:**
- Create: `src/webhooks/webhookVerifier.ts`
- Create: `src/webhooks/webhookVerifier.test.ts`
- Create: `src/webhooks/providerWebhookHandler.ts`
- Create: `src/webhooks/providerWebhookHandler.test.ts`

**Interfaces:**
- Produces: `verifyWebhookSignature(rawBody, headers, secret)` and idempotent handler by provider event id.

- [ ] **Step 1: Write failing HMAC and replay tests**

```ts
it("rejects invalid signature", () => {
  expect(() => verifyWebhookSignature(Buffer.from("{}"), { signature: "bad", timestamp: "1" }, "secret")).toThrow("WEBHOOK_SIGNATURE_INVALID");
});

it("ignores an already processed provider event", async () => {
  await handler.handle(validEvent);
  await handler.handle(validEvent);
  expect(repo.statusUpdateCount).toBe(1);
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/webhooks`
Expected: FAIL.

- [ ] **Step 3: Implement HMAC, timestamp window and event-id idempotency**

Use `crypto.createHmac` + `timingSafeEqual`; reject stale timestamp before changing state; persist provider event id before effects inside one transaction boundary.

- [ ] **Step 4: Run GREEN**

Run: `pnpm test -- src/webhooks && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/webhooks
git commit -m "feat: add secure idempotent provider webhooks"
```

### Task 9: Evidence validation

**Files:**
- Create: `src/evidence/evidenceValidator.ts`
- Create: `src/evidence/evidenceValidator.test.ts`

**Interfaces:**
- Produces: `validateEvidence(input): { valid: boolean; reason?: string }`.

- [ ] **Step 1: Write failing integrity tests**

```ts
it("accepts the signed document only when the stored signed hash matches", () => {
  expect(validateEvidence({ signedDocument: Buffer.from("signed"), expectedSha256 })).toEqual({ valid: true });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/evidence/evidenceValidator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement hash validation**

Compare recalculated SHA-256 to persisted evidence hash. Provider-specific certificate-chain validation remains behind a future provider capability.

- [ ] **Step 4: Run GREEN**

Run: `pnpm test -- src/evidence/evidenceValidator.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/evidence
git commit -m "feat: validate signature evidence integrity"
```

### Task 10: HTTP API and OpenAPI contract

**Files:**
- Create: `src/http/signatureRoutes.ts`
- Create: `src/http/signatureRoutes.test.ts`
- Create: `docs/openapi.yaml`
- Modify: `src/app.ts`

**Interfaces:**
- Produces the `/v1/signature-requests` API defined in the spec.

- [ ] **Step 1: Write failing API tests**

```ts
it("ignores tenantId supplied by a caller and uses authenticated context", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/signature-requests",
    headers: { authorization: "Bearer test-tenant-a" },
    payload: { tenantId: "tenant-b", signer: { name: "Ana" }, documentBase64: "ZG9j" },
  });
  expect(response.statusCode).toBe(201);
  expect(response.json().tenantId).toBeUndefined();
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/http/signatureRoutes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement validated routes**

Use Zod strict schemas; never pass payload `tenantId` into domain logic; tenant comes from auth middleware.

- [ ] **Step 4: Run GREEN**

Run: `pnpm test -- src/http/signatureRoutes.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/http src/app.ts docs/openapi.yaml
git commit -m "feat: expose signature service API"
```

### Task 11: Security regression gate and release candidate

**Files:**
- Create: `scripts/security-regression-check.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/quality.yml`
- Create: `docs/releases/d009a-verification.md`

**Interfaces:**
- Produces deterministic security gate for tenant isolation, no private-key storage, webhook verification and idempotency.

- [ ] **Step 1: Write security checks**

Assert that public request schema does not authorize tenant, repository has no unscoped `findById(id)`, webhook uses timing-safe comparison, no PEM/private-key persistence field exists, and migrations are journaled.

- [ ] **Step 2: Run security gate**

Run: `pnpm security:check`
Expected: PASS.

- [ ] **Step 3: Run complete gates**

Run: `pnpm security:check && pnpm check && pnpm test && pnpm build`
Expected: all PASS.

- [ ] **Step 4: Create checkpoint**

```bash
git branch checkpoint/d009a-signature-service-green-20260906
```

- [ ] **Step 5: Commit verification report**

```bash
git add scripts package.json .github/workflows/quality.yml docs/releases/d009a-verification.md
git commit -m "chore: gate D-009A release candidate"
```

### Task 12: Dispatch integration contract only

**Files in `jeffaxe81/dispatch` after D-009A is GREEN and only with separate approval:**
- Create: `shared/signature-service-contract.ts`
- Create: `server/signatureServiceClient.ts`
- Create: `server/signatureServiceClient.test.ts`

**Interfaces:**
- Consumes: D-009 HTTP API.
- Produces: typed client for occurrence/form/document integration.

- [ ] **Step 1: Write contract test against recorded fake HTTP behavior**
- [ ] **Step 2: Verify RED without client**
- [ ] **Step 3: Implement minimal typed client with correlation id and timeout**
- [ ] **Step 4: Run Dispatch security/check/test/build gates**
- [ ] **Step 5: Open a separate Dispatch PR; do not merge automatically**

This task is intentionally deferred until the independent D-009A service is GREEN and its API contract is frozen.