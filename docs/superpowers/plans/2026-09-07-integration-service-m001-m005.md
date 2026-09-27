# Integration Service M001–M005 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first homologable foundation of an independent AXE Sistemas Integration Service covering service bootstrap, universal connector contract, standard envelope, resilient HTTP client, and logical service registry.

**Architecture:** A standalone TypeScript service owns only integration metadata and exposes versioned boundaries. Product databases remain isolated; synchronous traffic uses APIs and asynchronous evolution will use controlled events. Core orchestration depends on provider-neutral contracts, not provider SDKs or hard-coded endpoints.

**Tech Stack:** Node.js 22 LTS, TypeScript 5.x strict mode, pnpm 10, Fastify 5, Zod 4, Pino 9, Undici 7, Vitest 3, PostgreSQL 16 for future integration metadata, Docker/Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-07-integration-service-m001-m005-design.md`

## Global Constraints

- Functional code MUST live in an independent repository, recommended `jeffaxe81/axesistemas-integration-service`.
- No functional Integration Service implementation is permitted in `jeffaxe81/dispatch`.
- Node.js runtime is `22.x`; package manager is pnpm `10.x`.
- TypeScript uses `strict: true` and does not permit implicit `any`.
- Every microdelivery follows TDD RED → GREEN.
- Tenant-scoped flows fail closed when `tenantId` is absent or ambiguous.
- Direct SQL queries between product databases are prohibited.
- Consumer code must not hard-code downstream service URLs.
- Secrets and credential-bearing headers must be redacted from logs.
- Unsafe non-idempotent HTTP requests are not retried by default.
- No production deploy, production migration, permission grant, or merge to `main` is automatic.
- M001–M005 must be GREEN on one immutable candidate SHA before homologation.

---

## File Structure

```text
axesistemas-integration-service/
├── .github/workflows/quality.yml
├── docs/
│   ├── architecture.md
│   └── runbook-local.md
├── src/
│   ├── app/
│   │   ├── buildApp.ts
│   │   └── routes/health.ts
│   ├── config/
│   │   ├── env.ts
│   │   └── serviceRegistry.ts
│   ├── connectors/
│   │   ├── contract.ts
│   │   └── fakeConnector.ts
│   ├── context/
│   │   └── correlationContext.ts
│   ├── envelope/
│   │   ├── schema.ts
│   │   └── validateEnvelope.ts
│   ├── http/
│   │   ├── errors.ts
│   │   ├── retryPolicy.ts
│   │   └── resilientHttpClient.ts
│   ├── logging/
│   │   └── logger.ts
│   └── server.ts
├── tests/
│   ├── app/health.test.ts
│   ├── config/serviceRegistry.test.ts
│   ├── connectors/contract.test.ts
│   ├── envelope/validateEnvelope.test.ts
│   ├── http/resilientHttpClient.test.ts
│   └── logging/redaction.test.ts
├── .env.example
├── .gitignore
├── Dockerfile
├── compose.yaml
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── vitest.config.ts
```

Each file has one responsibility. Provider-specific connectors added later live under `src/connectors/providers/<provider>/` and implement `Connector` without modifying orchestration contracts.

---

### Task 1: M001 — Bootstrap, health, configuration, and quality gate

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `src/config/env.ts`
- Create: `src/app/buildApp.ts`
- Create: `src/app/routes/health.ts`
- Create: `src/server.ts`
- Create: `tests/app/health.test.ts`
- Create: `Dockerfile`
- Create: `compose.yaml`
- Create: `.github/workflows/quality.yml`
- Create: `docs/runbook-local.md`

**Interfaces:**
- Produces: `loadEnv(input?: NodeJS.ProcessEnv): AppEnv`
- Produces: `buildApp(options?: { env?: AppEnv }): FastifyInstance`
- Produces: `GET /health/live -> { status: "ok" }`
- Produces: `GET /health/ready -> { status: "ready" }`

- [ ] **Step 1: Initialize the independent repository locally and create the feature branch**

```bash
mkdir axesistemas-integration-service
cd axesistemas-integration-service
git init -b main
git checkout -b feature/m001-m005-foundation
corepack enable
corepack prepare pnpm@10.15.0 --activate
```

Expected: empty Git repository on `feature/m001-m005-foundation`.

- [ ] **Step 2: Create `package.json` with pinned runtime scripts and dependencies**

```json
{
  "name": "@axesistemas/integration-service",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22 <23" },
  "packageManager": "pnpm@10.15.0",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "quality": "pnpm check && pnpm test && pnpm build",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "fastify": "^5.5.0",
    "pino": "^9.9.0",
    "undici": "^7.15.0",
    "zod": "^4.1.5"
  },
  "devDependencies": {
    "@types/node": "^22.18.0",
    "tsx": "^4.20.5",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
```

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` created with no install failure.

- [ ] **Step 3: Write the failing health endpoint test**

```ts
// tests/app/health.test.ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app/buildApp.js";

describe("health endpoints", () => {
  it("reports liveness and readiness", async () => {
    const app = buildApp({
      env: { NODE_ENV: "test", PORT: 3000, LOG_LEVEL: "silent" }
    });

    const live = await app.inject({ method: "GET", url: "/health/live" });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: "ok" });

    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });
  });
});
```

- [ ] **Step 4: Run the test and verify RED**

```bash
pnpm vitest run tests/app/health.test.ts
```

Expected: FAIL because `src/app/buildApp.ts` does not exist.

- [ ] **Step 5: Implement strict environment parsing**

```ts
// src/config/env.ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(input);
}
```

- [ ] **Step 6: Implement health routes and application factory**

```ts
// src/app/routes/health.ts
import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health/live", async () => ({ status: "ok" as const }));
  app.get("/health/ready", async () => ({ status: "ready" as const }));
}
```

```ts
// src/app/buildApp.ts
import Fastify, { type FastifyInstance } from "fastify";
import type { AppEnv } from "../config/env.js";
import { loadEnv } from "../config/env.js";
import { registerHealthRoutes } from "./routes/health.js";

export function buildApp(options: { env?: AppEnv } = {}): FastifyInstance {
  const env = options.env ?? loadEnv();
  const app = Fastify({ logger: env.LOG_LEVEL === "silent" ? false : { level: env.LOG_LEVEL } });
  void app.register(registerHealthRoutes);
  return app;
}
```

```ts
// src/server.ts
import { buildApp } from "./app/buildApp.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const app = buildApp({ env });

await app.listen({ host: "0.0.0.0", port: env.PORT });
```

- [ ] **Step 7: Run the health test and verify GREEN**

```bash
pnpm vitest run tests/app/health.test.ts
```

Expected: PASS.

- [ ] **Step 8: Add TypeScript and Vitest configuration**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 9: Add local container artifacts**

```dockerfile
# Dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["pnpm", "start"]
```

```yaml
# compose.yaml
services:
  integration-service:
    build: .
    environment:
      NODE_ENV: development
      PORT: 8080
      LOG_LEVEL: info
    ports:
      - "8080:8080"
```

- [ ] **Step 10: Add CI quality workflow**

```yaml
# .github/workflows/quality.yml
name: Quality
on:
  pull_request:
  push:
    branches: [main]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: corepack enable
      - run: corepack prepare pnpm@10.15.0 --activate
      - run: pnpm install --frozen-lockfile
      - run: pnpm quality
```

- [ ] **Step 11: Run Task 1 gate**

```bash
pnpm quality
docker compose build
```

Expected: type check, tests, build, and container build are GREEN.

- [ ] **Step 12: Commit M001**

```bash
git add .
git commit -m "feat: bootstrap integration service foundation"
```

---

### Task 2: M002 — Universal Connector Contract

**Files:**
- Create: `src/connectors/contract.ts`
- Create: `src/connectors/fakeConnector.ts`
- Create: `tests/connectors/contract.test.ts`

**Interfaces:**
- Produces: `Connector<TConfig, TInput, TOutput>`
- Produces: `ConnectorHealth`
- Produces: `ConnectorExecutionContext`
- Produces: `FakeConnector`

- [ ] **Step 1: Write the failing connector contract behavior test**

```ts
// tests/connectors/contract.test.ts
import { describe, expect, it } from "vitest";
import { FakeConnector } from "../../src/connectors/fakeConnector.js";

describe("Connector contract", () => {
  it("supports validation, lifecycle, health and execution through one stable interface", async () => {
    const connector = new FakeConnector();

    expect(connector.id).toBe("fake");
    expect(connector.version).toBe("1.0.0");
    expect(connector.validateConfig({ endpoint: "http://fake.local" }).success).toBe(true);

    await connector.connect({ endpoint: "http://fake.local" });
    expect(await connector.health()).toEqual({ status: "up" });

    const result = await connector.execute(
      { operation: "echo", payload: { value: 42 } },
      { correlationId: "corr-1", requestId: "req-1", tenantId: "tenant-a" }
    );
    expect(result).toEqual({ echoed: { value: 42 } });

    await connector.disconnect();
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
pnpm vitest run tests/connectors/contract.test.ts
```

Expected: FAIL because connector files do not exist.

- [ ] **Step 3: Implement the provider-neutral contract**

```ts
// src/connectors/contract.ts
export type ConnectorHealth = { status: "up" | "degraded" | "down"; reason?: string };

export type ConnectorExecutionContext = {
  correlationId: string;
  requestId?: string;
  tenantId?: string;
};

export type ValidationResult =
  | { success: true }
  | { success: false; issues: string[] };

export interface Connector<TConfig, TInput, TOutput> {
  readonly id: string;
  readonly version: string;
  readonly capabilities: readonly string[];
  validateConfig(config: unknown): ValidationResult;
  connect(config: TConfig): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<ConnectorHealth>;
  execute(input: TInput, context: ConnectorExecutionContext): Promise<TOutput>;
}
```

- [ ] **Step 4: Implement deterministic fake connector used by contract tests**

```ts
// src/connectors/fakeConnector.ts
import { z } from "zod";
import type { Connector, ConnectorExecutionContext, ConnectorHealth, ValidationResult } from "./contract.js";

const configSchema = z.object({ endpoint: z.string().url() });
type FakeConfig = z.infer<typeof configSchema>;
type FakeInput = { operation: "echo"; payload: unknown };
type FakeOutput = { echoed: unknown };

export class FakeConnector implements Connector<FakeConfig, FakeInput, FakeOutput> {
  readonly id = "fake";
  readonly version = "1.0.0";
  readonly capabilities = ["echo"] as const;
  private connected = false;

  validateConfig(config: unknown): ValidationResult {
    const result = configSchema.safeParse(config);
    return result.success ? { success: true } : { success: false, issues: result.error.issues.map(i => i.message) };
  }

  async connect(config: FakeConfig): Promise<void> {
    configSchema.parse(config);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async health(): Promise<ConnectorHealth> {
    return this.connected ? { status: "up" } : { status: "down", reason: "not_connected" };
  }

  async execute(input: FakeInput, _context: ConnectorExecutionContext): Promise<FakeOutput> {
    if (!this.connected) throw new Error("connector_not_connected");
    return { echoed: input.payload };
  }
}
```

- [ ] **Step 5: Verify GREEN and regression**

```bash
pnpm vitest run tests/connectors/contract.test.ts
pnpm quality
```

Expected: GREEN.

- [ ] **Step 6: Commit M002**

```bash
git add src/connectors tests/connectors
git commit -m "feat: add universal connector contract"
```

---

### Task 3: M003 — Standard Communication Envelope and fail-closed tenant validation

**Files:**
- Create: `src/envelope/schema.ts`
- Create: `src/envelope/validateEnvelope.ts`
- Create: `tests/envelope/validateEnvelope.test.ts`

**Interfaces:**
- Produces: `CommunicationEnvelope<TPayload>`
- Produces: `validateEnvelope(input: unknown, options?: { tenantRequired?: boolean }): CommunicationEnvelope`

- [ ] **Step 1: Write failing envelope tests**

```ts
// tests/envelope/validateEnvelope.test.ts
import { describe, expect, it } from "vitest";
import { validateEnvelope } from "../../src/envelope/validateEnvelope.js";

const base = {
  id: "evt-1",
  correlationId: "corr-1",
  requestId: "req-1",
  tenantId: "tenant-a",
  source: "dispatch",
  destination: "crm",
  type: "contact.requested",
  version: "1.0",
  timestamp: "2026-09-07T22:00:00.000Z",
  payload: { contactId: "c-1" }
};

describe("validateEnvelope", () => {
  it("accepts a valid versioned envelope", () => {
    expect(validateEnvelope(base, { tenantRequired: true })).toEqual(base);
  });

  it("fails closed when tenant is required and absent", () => {
    const { tenantId: _tenantId, ...withoutTenant } = base;
    expect(() => validateEnvelope(withoutTenant, { tenantRequired: true })).toThrow("tenant_required");
  });

  it("rejects malformed timestamps", () => {
    expect(() => validateEnvelope({ ...base, timestamp: "not-a-date" })).toThrow();
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
pnpm vitest run tests/envelope/validateEnvelope.test.ts
```

Expected: FAIL because envelope implementation does not exist.

- [ ] **Step 3: Implement the envelope schema**

```ts
// src/envelope/schema.ts
import { z } from "zod";

export const communicationEnvelopeSchema = z.object({
  id: z.string().min(1),
  correlationId: z.string().min(1),
  requestId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  source: z.string().min(1),
  destination: z.string().min(1),
  type: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+$/),
  timestamp: z.string().datetime({ offset: true }),
  payload: z.unknown()
});

export type CommunicationEnvelope = z.infer<typeof communicationEnvelopeSchema>;
```

- [ ] **Step 4: Implement fail-closed tenant validation**

```ts
// src/envelope/validateEnvelope.ts
import { communicationEnvelopeSchema, type CommunicationEnvelope } from "./schema.js";

export function validateEnvelope(
  input: unknown,
  options: { tenantRequired?: boolean } = {}
): CommunicationEnvelope {
  const envelope = communicationEnvelopeSchema.parse(input);
  if (options.tenantRequired === true && envelope.tenantId === undefined) {
    throw new Error("tenant_required");
  }
  return envelope;
}
```

- [ ] **Step 5: Verify GREEN and regression**

```bash
pnpm vitest run tests/envelope/validateEnvelope.test.ts
pnpm quality
```

Expected: GREEN.

- [ ] **Step 6: Commit M003**

```bash
git add src/envelope tests/envelope
git commit -m "feat: add standard communication envelope"
```

---

### Task 4: M004 — Resilient HTTP Client with safe retry and correlation propagation

**Files:**
- Create: `src/http/errors.ts`
- Create: `src/http/retryPolicy.ts`
- Create: `src/http/resilientHttpClient.ts`
- Create: `src/context/correlationContext.ts`
- Create: `tests/http/resilientHttpClient.test.ts`

**Interfaces:**
- Produces: `HttpRequestContext`
- Produces: `NormalizedHttpError`
- Produces: `shouldRetry(input: RetryDecisionInput): boolean`
- Produces: `createResilientHttpClient(options): ResilientHttpClient`

- [ ] **Step 1: Write failing safe-retry tests using an injected transport**

```ts
// tests/http/resilientHttpClient.test.ts
import { describe, expect, it, vi } from "vitest";
import { createResilientHttpClient } from "../../src/http/resilientHttpClient.js";

describe("resilient HTTP client", () => {
  it("retries GET on transient 503 and propagates correlation headers", async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce({ statusCode: 503, body: "unavailable" })
      .mockResolvedValueOnce({ statusCode: 200, body: "ok" });

    const client = createResilientHttpClient({ transport, maxAttempts: 2, sleep: async () => {} });
    const response = await client.request({
      method: "GET",
      url: "http://crm.local/health",
      context: { correlationId: "corr-1", requestId: "req-1", tenantId: "tenant-a" }
    });

    expect(response.statusCode).toBe(200);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0]?.[0].headers).toMatchObject({
      "x-correlation-id": "corr-1",
      "x-request-id": "req-1",
      "x-tenant-id": "tenant-a"
    });
  });

  it("does not retry POST without an idempotency key", async () => {
    const transport = vi.fn().mockResolvedValue({ statusCode: 503, body: "unavailable" });
    const client = createResilientHttpClient({ transport, maxAttempts: 3, sleep: async () => {} });

    await expect(client.request({
      method: "POST",
      url: "http://crm.local/contacts",
      context: { correlationId: "corr-2" },
      body: "{}"
    })).rejects.toMatchObject({ category: "unavailable_dependency" });

    expect(transport).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
pnpm vitest run tests/http/resilientHttpClient.test.ts
```

Expected: FAIL because HTTP client does not exist.

- [ ] **Step 3: Implement normalized errors and retry policy**

```ts
// src/http/errors.ts
export type HttpErrorCategory =
  | "validation_error"
  | "authentication_error"
  | "authorization_error"
  | "timeout"
  | "unavailable_dependency"
  | "rate_limited"
  | "conflict"
  | "provider_rejection"
  | "internal_error";

export class NormalizedHttpError extends Error {
  constructor(
    public readonly category: HttpErrorCategory,
    public readonly statusCode?: number
  ) {
    super(category);
  }
}
```

```ts
// src/http/retryPolicy.ts
export type RetryDecisionInput = {
  method: string;
  statusCode?: number;
  idempotencyKey?: string;
};

const safeMethods = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);
const transientStatuses = new Set([429, 502, 503, 504]);

export function shouldRetry(input: RetryDecisionInput): boolean {
  const retrySafe = safeMethods.has(input.method) || Boolean(input.idempotencyKey);
  return retrySafe && input.statusCode !== undefined && transientStatuses.has(input.statusCode);
}
```

- [ ] **Step 4: Implement the injectable resilient client**

```ts
// src/http/resilientHttpClient.ts
import { request as undiciRequest } from "undici";
import { NormalizedHttpError } from "./errors.js";
import { shouldRetry } from "./retryPolicy.js";

export type HttpRequestContext = {
  correlationId: string;
  requestId?: string;
  tenantId?: string;
};

type TransportInput = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

type TransportResult = { statusCode: number; body: string };
type Transport = (input: TransportInput) => Promise<TransportResult>;

const defaultTransport: Transport = async input => {
  const response = await undiciRequest(input.url, {
    method: input.method as "GET",
    headers: input.headers,
    body: input.body
  });
  return { statusCode: response.statusCode, body: await response.body.text() };
};

function normalizeStatus(statusCode: number): NormalizedHttpError {
  if (statusCode === 401) return new NormalizedHttpError("authentication_error", statusCode);
  if (statusCode === 403) return new NormalizedHttpError("authorization_error", statusCode);
  if (statusCode === 409) return new NormalizedHttpError("conflict", statusCode);
  if (statusCode === 429) return new NormalizedHttpError("rate_limited", statusCode);
  if ([502, 503, 504].includes(statusCode)) return new NormalizedHttpError("unavailable_dependency", statusCode);
  return new NormalizedHttpError("provider_rejection", statusCode);
}

export function createResilientHttpClient(options: {
  transport?: Transport;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
} = {}) {
  const transport = options.transport ?? defaultTransport;
  const maxAttempts = options.maxAttempts ?? 3;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));

  return {
    async request(input: {
      method: string;
      url: string;
      context: HttpRequestContext;
      headers?: Record<string, string>;
      body?: string;
      idempotencyKey?: string;
    }): Promise<TransportResult> {
      const headers: Record<string, string> = {
        ...(input.headers ?? {}),
        "x-correlation-id": input.context.correlationId
      };
      if (input.context.requestId) headers["x-request-id"] = input.context.requestId;
      if (input.context.tenantId) headers["x-tenant-id"] = input.context.tenantId;
      if (input.idempotencyKey) headers["idempotency-key"] = input.idempotencyKey;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const response = await transport({ method: input.method, url: input.url, headers, body: input.body });
        if (response.statusCode >= 200 && response.statusCode < 300) return response;
        const retry = shouldRetry({
          method: input.method,
          statusCode: response.statusCode,
          idempotencyKey: input.idempotencyKey
        });
        if (!retry || attempt === maxAttempts) throw normalizeStatus(response.statusCode);
        await sleep(Math.min(100 * 2 ** (attempt - 1), 1000));
      }
      throw new NormalizedHttpError("internal_error");
    }
  };
}
```

- [ ] **Step 5: Verify GREEN and regression**

```bash
pnpm vitest run tests/http/resilientHttpClient.test.ts
pnpm quality
```

Expected: GREEN.

- [ ] **Step 6: Commit M004**

```bash
git add src/http src/context tests/http
git commit -m "feat: add resilient outbound HTTP client"
```

---

### Task 5: M005 — Logical Service Registry without hard-coded consumer URLs

**Files:**
- Modify: `src/config/env.ts`
- Create: `src/config/serviceRegistry.ts`
- Create: `tests/config/serviceRegistry.test.ts`

**Interfaces:**
- Produces: `ServiceName`
- Produces: `ServiceRegistry`
- Produces: `createServiceRegistry(config: Record<ServiceName, string>): ServiceRegistry`
- Produces: `registry.resolve(name: ServiceName): URL`

- [ ] **Step 1: Write failing registry tests**

```ts
// tests/config/serviceRegistry.test.ts
import { describe, expect, it } from "vitest";
import { createServiceRegistry } from "../../src/config/serviceRegistry.js";

describe("service registry", () => {
  it("resolves configured logical services", () => {
    const registry = createServiceRegistry({
      dispatch: "http://dispatch.local",
      crm: "http://crm.local",
      "event-engine": "http://events.local",
      "signature-service": "http://signature.local"
    });

    expect(registry.resolve("crm").toString()).toBe("http://crm.local/");
  });

  it("fails closed for unknown services", () => {
    const registry = createServiceRegistry({
      dispatch: "http://dispatch.local",
      crm: "http://crm.local",
      "event-engine": "http://events.local",
      "signature-service": "http://signature.local"
    });

    expect(() => registry.resolve("unknown" as never)).toThrow("service_not_registered");
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
pnpm vitest run tests/config/serviceRegistry.test.ts
```

Expected: FAIL because registry implementation does not exist.

- [ ] **Step 3: Implement validated registry**

```ts
// src/config/serviceRegistry.ts
import { z } from "zod";

export const serviceNames = ["dispatch", "crm", "event-engine", "signature-service"] as const;
export type ServiceName = typeof serviceNames[number];

const urlSchema = z.string().url();

export type ServiceRegistry = {
  resolve(name: ServiceName): URL;
};

export function createServiceRegistry(config: Record<ServiceName, string>): ServiceRegistry {
  const entries = new Map<ServiceName, URL>();
  for (const name of serviceNames) {
    entries.set(name, new URL(urlSchema.parse(config[name])));
  }

  return {
    resolve(name: ServiceName): URL {
      const result = entries.get(name);
      if (!result) throw new Error("service_not_registered");
      return result;
    }
  };
}
```

- [ ] **Step 4: Extend environment schema for service URLs**

```ts
// additions to src/config/env.ts schema
DISPATCH_BASE_URL: z.string().url(),
CRM_BASE_URL: z.string().url(),
EVENT_ENGINE_BASE_URL: z.string().url(),
SIGNATURE_SERVICE_BASE_URL: z.string().url()
```

Update `.env.example` with:

```dotenv
NODE_ENV=development
PORT=8080
LOG_LEVEL=info
DISPATCH_BASE_URL=http://dispatch:8080
CRM_BASE_URL=http://crm:8080
EVENT_ENGINE_BASE_URL=http://event-engine:8080
SIGNATURE_SERVICE_BASE_URL=http://signature-service:8080
```

- [ ] **Step 5: Verify GREEN and regression**

```bash
pnpm vitest run tests/config/serviceRegistry.test.ts
pnpm quality
```

Expected: GREEN.

- [ ] **Step 6: Commit M005**

```bash
git add src/config tests/config .env.example
git commit -m "feat: add logical service registry"
```

---

### Task 6: Security logging gate and candidate closure for M001–M005

**Files:**
- Create: `src/logging/logger.ts`
- Create: `tests/logging/redaction.test.ts`
- Create: `docs/architecture.md`
- Modify: `docs/runbook-local.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `createLogger(level: string)` with deterministic redaction for sensitive fields.

- [ ] **Step 1: Write failing log-redaction test**

```ts
// tests/logging/redaction.test.ts
import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/logging/logger.js";

describe("logger redaction", () => {
  it("redacts credentials and authorization material", () => {
    const records: string[] = [];
    const logger = createLogger("info", line => records.push(line));

    logger.info({
      authorization: "Bearer secret-token",
      apiKey: "secret-key",
      password: "secret-password",
      safe: "visible"
    }, "request");

    const line = records.join("\n");
    expect(line).not.toContain("secret-token");
    expect(line).not.toContain("secret-key");
    expect(line).not.toContain("secret-password");
    expect(line).toContain("visible");
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
pnpm vitest run tests/logging/redaction.test.ts
```

Expected: FAIL because logger factory does not exist.

- [ ] **Step 3: Implement structured redacting logger**

```ts
// src/logging/logger.ts
import pino from "pino";

export function createLogger(level: string, sink?: (line: string) => void) {
  const destination = sink
    ? { write: (line: string) => sink(line) }
    : undefined;

  return pino({
    level,
    redact: {
      paths: ["authorization", "apiKey", "password", "token", "headers.authorization", "headers.x-api-key"],
      censor: "[REDACTED]"
    }
  }, destination as never);
}
```

- [ ] **Step 4: Add the security check script**

Add to `package.json` scripts:

```json
"security:check": "vitest run tests/logging/redaction.test.ts tests/envelope/validateEnvelope.test.ts tests/http/resilientHttpClient.test.ts"
```

And update quality:

```json
"quality": "pnpm check && pnpm test && pnpm security:check && pnpm build"
```

- [ ] **Step 5: Document architecture and local validation**

`docs/architecture.md` must state:

```text
- Each product owns its database.
- Cross-product SQL is prohibited.
- Synchronous integration uses versioned APIs.
- Tenant-scoped traffic fails closed without tenant context.
- Logical services resolve through ServiceRegistry.
- Provider implementations depend on Connector, not on orchestration internals.
- No credential-bearing data may appear in logs.
```

`docs/runbook-local.md` must include these exact validation commands:

```bash
pnpm install --frozen-lockfile
pnpm quality
docker compose build
docker compose up -d
curl --fail http://localhost:8080/health/live
curl --fail http://localhost:8080/health/ready
docker compose down
```

- [ ] **Step 6: Run the complete candidate gate on one SHA**

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm security:check
pnpm build
docker compose build
```

Expected: every command exits `0`.

- [ ] **Step 7: Commit candidate closure**

```bash
git add src/logging tests/logging docs package.json pnpm-lock.yaml
git commit -m "test: close M001-M005 quality and security gates"
```

- [ ] **Step 8: Create immutable checkpoint and Draft PR**

```bash
git tag checkpoint/integration-m001-m005-green-20260907
git push origin feature/m001-m005-foundation
git push origin checkpoint/integration-m001-m005-green-20260907
```

Create the PR as Draft with title:

```text
Integration Service M001–M005 — foundation, connector contract, envelope, HTTP resilience and registry
```

The PR body must record the immutable candidate SHA and the exact GREEN gate outputs. It must also state: no deploy, no production migration, no grants, no automatic merge.

---

## Homologation Gate

M001–M005 are candidates for approval only when all of the following are true on the same commit SHA:

```text
frozen install       GREEN
TypeScript check     GREEN
unit tests           GREEN
connector contract   GREEN
envelope validation  GREEN
HTTP retry safety    GREEN
service registry     GREEN
security/redaction   GREEN
production build     GREEN
container build      GREEN
documentation review GREEN
```

After technical GREEN, promote the PR from Draft to Ready for Review only with the project owner's explicit approval. Merge to `main` remains a separate controlled action.
