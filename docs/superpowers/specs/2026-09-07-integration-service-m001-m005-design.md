# Integration Service M001–M005 — Design

## Status
Approved architecture for the first independent delivery slice of the AXE Sistemas Integration Service.

## Target repository
The functional implementation MUST live in an independent repository, recommended name: `jeffaxe81/axesistemas-integration-service`.

This `dispatch` repository contains only the architectural specification, implementation plan, and future integration contract. No functional implementation of the Integration Service is authorized inside `dispatch`.

## Goal
Create the first homologable foundation of a universal integration/orchestration service that connects AXE Sistemas products and external systems without direct cross-database access.

## Architectural rules
1. Each product owns its own data and database.
2. Direct SQL queries between product databases are prohibited as the normal integration mechanism.
3. Synchronous cross-product communication uses versioned APIs.
4. Asynchronous propagation uses controlled events.
5. The Integration Service has its own database for integration metadata, configuration, idempotency, operational state, and traceability only; it is not a central business-data database.
6. Tenant context is mandatory whenever the flow is tenant-scoped and MUST fail closed when absent or ambiguous.
7. Correlation and request identifiers must propagate end-to-end.
8. Secrets and credentials must never be logged.
9. Retry is allowed only when the operation is safe to retry or protected by idempotency.
10. No deploy, production migration, permission grant, or merge is automatic.

## Scope

### M001 — Service foundation
Deliver an independent backend service with:
- environment-based configuration;
- `/health/live` liveness endpoint;
- `/health/ready` readiness endpoint;
- structured logging;
- Dockerfile and local Compose profile;
- automated CI for install, static checks, tests, and build;
- base documentation.

No real external connector is part of M001.

### M002 — Universal Connector Contract
Define a provider-neutral connector interface with:
- `id`;
- `version`;
- `capabilities`;
- `connect()`;
- `disconnect()`;
- `health()`;
- `execute()`;
- `validateConfig()`.

A connector implementation must be replaceable without changing orchestration-domain code.

### M003 — Standard Communication Envelope
Every controlled request/event uses a versioned envelope containing:
- `id`;
- `correlationId`;
- `requestId` when applicable;
- `tenantId` when tenant-scoped;
- `source`;
- `destination`;
- `type`;
- `version`;
- `timestamp`;
- `payload`.

The envelope is validated at the service boundary. Invalid envelopes are rejected before provider execution.

### M004 — Resilient HTTP Client
Provide a single outbound HTTP abstraction with:
- connect/request timeout;
- controlled retry;
- exponential backoff with bounded attempts;
- correlation/request header propagation;
- sanitized structured logs;
- normalized error mapping;
- idempotency-awareness.

The client must not retry unsafe non-idempotent requests by default.

### M005 — Service Registry
Provide configuration-driven discovery of logical services such as:
- `dispatch`;
- `crm`;
- `event-engine`;
- `signature-service`;
- future services.

Application code resolves a logical service through the registry instead of embedding service URLs.

## Component model

```text
Product / External System
        |
        v
Integration API boundary
        |
        +--> Envelope validation
        +--> Tenant resolution / fail-closed checks
        +--> Correlation context
        |
        v
Orchestration core
        |
        +--> Service Registry
        +--> Connector Contract
        +--> Resilient HTTP Client
        |
        v
Connector / Target API
```

## Data ownership

```text
CRM DB          ┐
Dispatch DB     │
Events DB       ├── isolated ownership
Signature DB    │
Integration DB  ┘
```

The Integration DB may store connector configuration metadata, health state, idempotency keys, delivery/control records, and audit/trace data. It must not duplicate full authoritative business aggregates owned by other products.

## Security
- Tenant scope is server-resolved and fail-closed.
- Secrets are injected by environment/secret provider, never committed.
- Logs redact authorization headers, tokens, passwords, API keys, and signature material.
- The service exposes no arbitrary remote-code execution or arbitrary URL execution facility.
- Provider configuration must be validated before activation.
- Authentication between services starts provider-neutral so that API key/HMAC or stronger mechanisms can be adopted without changing domain contracts.

## Reliability
The patterns already proven in Dispatch D-011A (health registry, passive watchdog concepts, circuit breaker discipline, sanitised observability) are architectural references, not code dependencies. The Integration Service keeps an independent lifecycle and repository.

M001–M005 include the foundation needed for health and resilient calls. Automatic restart, cross-region failover, dead-letter processing, reprocessing UI, advanced event brokers, and self-healing actions belong to later microdeliveries.

## Error model
External/provider failures are normalized into stable categories:
- validation error;
- authentication/authorization error;
- timeout;
- unavailable dependency;
- rate limited;
- conflict/idempotency conflict;
- provider rejection;
- internal error.

Provider-specific payloads must not leak directly across product boundaries.

## Testing strategy
Each microdelivery follows TDD RED → GREEN and must include tests at the lowest useful level.

Required gates for the M001–M005 candidate:
1. dependency install/frozen lock validation;
2. lint/static/type check;
3. unit tests;
4. connector contract tests;
5. envelope validation tests;
6. HTTP client retry/idempotency tests;
7. service registry resolution tests;
8. integration tests using deterministic local fakes;
9. security/log-redaction checks;
10. production build;
11. documentation review.

All gates must be GREEN on the same candidate commit before homologation.

## Acceptance criteria
M001–M005 are accepted when:
- the independent service boots locally and reports liveness/readiness;
- a fake connector can implement the universal contract without special-casing the core;
- valid envelopes are accepted and invalid/ambiguous tenant envelopes fail closed;
- outbound HTTP propagates correlation identifiers and follows retry safety rules;
- logical services resolve from registry configuration without hard-coded URLs in consumers;
- logs are structured and redact secrets;
- all required gates are GREEN on one immutable candidate SHA;
- no functional Integration Service code has been added to `dispatch`.

## Explicitly out of scope for this slice
- production deployment;
- production database migration;
- automatic grants;
- real provider credentials;
- real Dígitro/Asterisk/Intelbras connectors;
- Kafka/RabbitMQ/NATS selection;
- DLQ and manual reprocessing UI;
- automatic restart/failover;
- cross-product direct database access;
- merge to `main` without explicit approval.
