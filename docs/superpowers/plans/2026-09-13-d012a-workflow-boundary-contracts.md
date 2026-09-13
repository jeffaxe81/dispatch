# D-012A — Workflow Boundary & Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a fronteira arquitetural e os contratos versionados da D-012A, preservando integralmente o workflow simulado já existente e preparando tenant, correlação e idempotência para os ciclos D-012B–F sem alterar runtime, banco, UI ou estado crítico de Ocorrência.

**Architecture:** A D-012A adiciona uma camada pequena e pura: contrato público em `shared/workflowIntegration/v1.ts`, validação fail-closed em `server/workflow/workflowBoundary.ts`, testes de contrato/arquitetura e documentação da fronteira. O workflow atual permanece como implementação legada de simulação, com `server/db.ts`, tRPC, schema, migrations e páginas existentes intocados nesta microentrega. A conexão do novo contrato ao runtime será feita somente nos ciclos posteriores aprovados.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm/Corepack, arquitetura atual do AXE Dispatch.

**Spec:** `docs/superpowers/specs/2026-09-13-d012-workflow-automation-design.md`

## Global Constraints

- Baseline de referência: `main` em `03ed106ce18b42d48df1a0f9032d8d6548af671c`; antes de implementar, confirmar se `main` avançou e rebasear o plano sobre a `main` atual sem descartar mudanças aprovadas.
- O workflow existente em `server/db.ts`, `server/routers.ts`, `drizzle/schema.ts`, `client/src/pages/WorkflowBuilderPage.tsx` e `client/src/pages/ExecutionsPage.tsx` permanece funcional e explicitamente **simulação/mock**.
- D-012A não cria nem altera tabelas, migrations, grants, endpoints, procedures tRPC, páginas ou componentes de UI.
- D-012A não executa chamadas HTTP, processos, scripts, SQL configurável, URLs arbitrárias, plugins remotos, deploy, restart, failover ou automação produtiva.
- D-012A não altera automaticamente estado de Ocorrência, equipe, viatura, ativo, formulário ou outro domínio operacional.
- Tenant deve vir de contexto confiável; o contrato recebido nunca autoriza sozinho acesso a uma organização. A resolução completa de organização ativa/RBAC permanece na D-012E.
- Idempotência nesta etapa é somente uma chave determinística `tenantId + eventId`; armazenamento/deduplicação persistente pertence à D-012F.
- Não inventar eventos externos de D-008 ou Inventário nesta etapa. A allowlist inicial contém apenas eventos internos genéricos de Workflow; produtores externos serão ligados na D-012F a contratos reais verificados.
- D-008 continua proprietário de formulários e respostas; a integração funcional com formulários pertence à D-012H.
- Seguir TDD RED → GREEN em cada alteração funcional/testável.
- Nenhum merge em `main`, deploy, migration real ou grant produtivo sem aprovação explícita do responsável pelo projeto.

---

## File Structure

**Criar na D-012A:**

- `shared/workflowIntegration/v1.ts` — contrato versionado e estrito do envelope de eventos de Workflow; sem persistência, HTTP ou dependências de servidor.
- `server/workflowIntegrationContract.test.ts` — contrato público: versão, allowlist, campos obrigatórios, strictness e fail-closed.
- `server/workflow/workflowBoundary.ts` — funções puras para validar envelope contra tenant confiável e construir chave idempotente.
- `server/workflow/workflowBoundary.test.ts` — testes unitários da fronteira de tenant e idempotência.
- `server/workflowBoundaryArchitecture.test.ts` — invariantes de arquitetura e segurança, incluindo proteção do workflow simulado existente.
- `docs/architecture/d012-workflow-boundary.md` — ownership, coexistência com o workflow simulado legado, limites, evolução e rollback.
- `docs/superpowers/reports/2026-09-13-d012a-workflow-boundary-contracts-verification.md` — evidência final gerada somente depois dos gates reais ficarem GREEN.

**Não modificar na D-012A:**

- `server/db.ts`
- `server/routers.ts`
- `drizzle/schema.ts`
- qualquer `drizzle/*.sql`
- `client/src/pages/WorkflowBuilderPage.tsx`
- `client/src/pages/ExecutionsPage.tsx`
- contratos D-008 ou Inventário existentes

---

### Task 1: Fixar documentalmente a fronteira D-012A e o legado de simulação

**Files:**
- Create: `server/workflowBoundaryArchitecture.test.ts`
- Create: `docs/architecture/d012-workflow-boundary.md`

**Interfaces:**
- Consumes: estado atual do workflow simulado em `server/db.ts`, `server/workflowExecutor.test.ts`, `server/workflowExecutionTransactions.test.ts` e `client/src/pages/ExecutionsPage.tsx`.
- Produces: contrato arquitetural documental que as Tasks 2–4 devem respeitar.

- [ ] **Step 1: Criar o teste RED de existência e conteúdo obrigatório da fronteira**

Criar `server/workflowBoundaryArchitecture.test.ts` inicialmente com:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const boundaryDocPath = path.join(root, "docs", "architecture", "d012-workflow-boundary.md");

describe("D-012A workflow architecture boundary", () => {
  it("documenta a fronteira antes de introduzir novos contratos", () => {
    expect(fs.existsSync(boundaryDocPath)).toBe(true);
    const doc = fs.readFileSync(boundaryDocPath, "utf8");

    for (const required of [
      "workflow simulado legado",
      "server/db.ts",
      "SIMULAÇÃO / MOCK",
      "D-012A",
      "contrato versionado",
      "tenant",
      "correlationId",
      "idempotência",
      "fail-closed",
      "D-012B",
      "D-012C",
      "D-012E",
      "D-012F",
      "sem migration",
      "sem deploy",
      "sem grant",
    ]) {
      expect(doc).toContain(required);
    }
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar RED**

Run:

```bash
corepack pnpm exec vitest run server/workflowBoundaryArchitecture.test.ts
```

Expected: FAIL porque `docs/architecture/d012-workflow-boundary.md` ainda não existe.

- [ ] **Step 3: Criar a documentação mínima que satisfaz o contrato arquitetural**

Criar `docs/architecture/d012-workflow-boundary.md` com este conteúdo:

```markdown
# Fronteira Arquitetural D-012 — Workflow / Automação Operacional

## Estado atual

O AXE Dispatch já possui um **workflow simulado legado** implementado principalmente em `server/db.ts`, com definições versionadas, execuções persistidas, retries, dead-letter, auditoria e superfícies de UI. A tela de execuções o identifica como **SIMULAÇÃO / MOCK**, e os testes atuais comprovam `externalRequests: 0` e `simulationOnly: true`.

A D-012A não substitui, migra nem ativa esse runtime. Ela cria apenas uma fronteira de **contrato versionado** para que a evolução futura reutilize a base existente sem criar um segundo motor concorrente.

## Ownership da D-012A

A D-012A é proprietária somente de contratos compartilhados e validações puras da fronteira de Workflow. Ela define versão do envelope, allowlist inicial de eventos internos, `tenant`, `correlationId`, `eventId` e a chave determinística de **idempotência**.

O `tenant` recebido no envelope nunca é autorização por si só. O processamento deve comparar o envelope com um contexto confiável e operar em modo **fail-closed** quando houver versão inválida, formato inválido ou divergência de tenant.

## Limites

Nesta etapa não existe integração runtime do novo contrato com o executor simulado, tRPC, banco ou UI. Também não existe consumo de eventos externos de D-008 ou Inventário.

A D-012A opera **sem migration**, **sem deploy** e **sem grant**. Não altera tabelas, procedures, páginas, estados de Ocorrência ou comportamento operacional existente.

## Evolução controlada

- D-012B conecta o modelo de definição/versionamento aprovado à evolução do domínio existente.
- D-012C evolui instâncias e máquina de estados.
- D-012E aplica a resolução completa de organização ativa, RBAC e isolamento multi-tenant.
- D-012F liga produtores/eventos autorizados e a deduplicação persistente.

## Rollback

O rollback da D-012A remove somente os novos contratos, helpers puros, testes e esta documentação. Como não há migration, runtime wiring ou alteração de dados, não existe rollback de banco nesta microentrega.
```

- [ ] **Step 4: Executar novamente o teste e confirmar GREEN**

Run:

```bash
corepack pnpm exec vitest run server/workflowBoundaryArchitecture.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit da microentrega**

```bash
git add server/workflowBoundaryArchitecture.test.ts docs/architecture/d012-workflow-boundary.md
git commit -m "test: fixar fronteira arquitetural D-012A"
```

---

### Task 2: Publicar contrato v1 estrito de eventos internos de Workflow

**Files:**
- Create: `server/workflowIntegrationContract.test.ts`
- Create: `shared/workflowIntegration/v1.ts`

**Interfaces:**
- Consumes: Zod já usado no projeto e o padrão de `shared/inventoryIntegration/v1.ts`.
- Produces:
  - `WORKFLOW_CONTRACT_VERSION: "v1"`
  - `WORKFLOW_ENVELOPE_VERSION: "1"`
  - `WORKFLOW_EVENT_TYPES`
  - `workflowEventTypeSchema`
  - `workflowEventProducerSchema`
  - `workflowEventEnvelopeSchema`
  - `WorkflowEventType`
  - `WorkflowEventProducer`
  - `WorkflowEventEnvelope`

- [ ] **Step 1: Criar o teste RED do contrato**

Criar `server/workflowIntegrationContract.test.ts`:

```ts
import { describe, expect, it } from "vitest";

const contractModulePath = "../shared/workflowIntegration/v1";
const loadContracts = () => import(contractModulePath);

const validEvent = {
  envelopeVersion: "1",
  eventId: "event-0001",
  eventType: "workflow.manual.requested.v1",
  occurredAt: "2026-09-13T10:00:00-03:00",
  tenantId: "tenant-a",
  correlationId: "corr-0001",
  actorUserId: "user-7",
  producer: "axe-dispatch",
  payload: { requestedBy: "manual" },
};

describe("D-012A workflow integration contract v1", () => {
  it("publica versões explícitas do contrato e envelope", async () => {
    const contract = await loadContracts();
    expect(contract.WORKFLOW_CONTRACT_VERSION).toBe("v1");
    expect(contract.WORKFLOW_ENVELOPE_VERSION).toBe("1");
  });

  it("aceita somente os eventos internos inicialmente autorizados", async () => {
    const { workflowEventEnvelopeSchema } = await loadContracts();
    expect(workflowEventEnvelopeSchema.parse(validEvent)).toEqual(validEvent);
    expect(() => workflowEventEnvelopeSchema.parse({
      ...validEvent,
      eventType: "asset.updated.v1",
    })).toThrow();
  });

  it("falha fechado para versão incompatível e campos arbitrários", async () => {
    const { workflowEventEnvelopeSchema } = await loadContracts();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, envelopeVersion: "2" })).toThrow();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, script: "return true" })).toThrow();
  });

  it("exige identificadores de rastreio válidos", async () => {
    const { workflowEventEnvelopeSchema } = await loadContracts();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, eventId: "short" })).toThrow();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, correlationId: "short" })).toThrow();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, tenantId: "" })).toThrow();
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar RED**

```bash
corepack pnpm exec vitest run server/workflowIntegrationContract.test.ts
```

Expected: FAIL porque `shared/workflowIntegration/v1.ts` ainda não existe.

- [ ] **Step 3: Implementar o contrato mínimo v1**

Criar `shared/workflowIntegration/v1.ts`:

```ts
import { z } from "zod";

export const WORKFLOW_CONTRACT_VERSION = "v1" as const;
export const WORKFLOW_ENVELOPE_VERSION = "1" as const;

export const WORKFLOW_EVENT_TYPES = [
  "workflow.manual.requested.v1",
  "workflow.instance.started.v1",
  "workflow.instance.transitioned.v1",
  "workflow.instance.completed.v1",
  "workflow.instance.failed.v1",
  "workflow.task.opened.v1",
  "workflow.task.completed.v1",
] as const;

const opaqueIdSchema = z.string().trim().min(1).max(128);
const traceIdSchema = z.string().trim().min(8).max(160);

export const workflowEventTypeSchema = z.enum(WORKFLOW_EVENT_TYPES);

export const workflowEventProducerSchema = z.enum([
  "axe-dispatch",
  "workflow-engine",
]);

export const workflowEventEnvelopeSchema = z.object({
  envelopeVersion: z.literal(WORKFLOW_ENVELOPE_VERSION),
  eventId: traceIdSchema,
  eventType: workflowEventTypeSchema,
  occurredAt: z.string().datetime({ offset: true }),
  tenantId: opaqueIdSchema,
  correlationId: traceIdSchema,
  actorUserId: opaqueIdSchema.optional(),
  producer: workflowEventProducerSchema,
  payload: z.record(z.string(), z.unknown()),
}).strict();

export type WorkflowEventType = z.infer<typeof workflowEventTypeSchema>;
export type WorkflowEventProducer = z.infer<typeof workflowEventProducerSchema>;
export type WorkflowEventEnvelope = z.infer<typeof workflowEventEnvelopeSchema>;
```

- [ ] **Step 4: Executar o teste e confirmar GREEN**

```bash
corepack pnpm exec vitest run server/workflowIntegrationContract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit da microentrega**

```bash
git add shared/workflowIntegration/v1.ts server/workflowIntegrationContract.test.ts
git commit -m "feat: adicionar contrato v1 do workflow D-012A"
```

---

### Task 3: Implementar fronteira pura de tenant confiável e idempotência

**Files:**
- Create: `server/workflow/workflowBoundary.test.ts`
- Create: `server/workflow/workflowBoundary.ts`

**Interfaces:**
- Consumes: `workflowEventEnvelopeSchema` e `WorkflowEventEnvelope` de `shared/workflowIntegration/v1.ts`.
- Produces:
  - `WorkflowBoundaryErrorCode`
  - `WorkflowBoundaryError`
  - `parseTrustedWorkflowEvent(input, trustedTenantId)`
  - `buildWorkflowIdempotencyKey(event)`

- [ ] **Step 1: Criar o teste RED de tenant e idempotência**

Criar `server/workflow/workflowBoundary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildWorkflowIdempotencyKey,
  parseTrustedWorkflowEvent,
  WorkflowBoundaryError,
} from "./workflowBoundary";

const validEvent = {
  envelopeVersion: "1",
  eventId: "event-0001",
  eventType: "workflow.manual.requested.v1",
  occurredAt: "2026-09-13T10:00:00-03:00",
  tenantId: "tenant-a",
  correlationId: "corr-0001",
  actorUserId: "user-7",
  producer: "axe-dispatch",
  payload: {},
};

describe("D-012A trusted workflow boundary", () => {
  it("aceita evento válido somente quando o tenant coincide com o contexto confiável", () => {
    expect(parseTrustedWorkflowEvent(validEvent, "tenant-a")).toEqual(validEvent);
  });

  it("falha fechado quando o tenant do envelope diverge", () => {
    expect(() => parseTrustedWorkflowEvent(validEvent, "tenant-b")).toThrowError(
      expect.objectContaining<Partial<WorkflowBoundaryError>>({ code: "workflow_tenant_mismatch" }),
    );
  });

  it("classifica envelope inválido sem vazar detalhes internos", () => {
    expect(() => parseTrustedWorkflowEvent({ ...validEvent, envelopeVersion: "2" }, "tenant-a")).toThrowError(
      expect.objectContaining<Partial<WorkflowBoundaryError>>({ code: "workflow_event_invalid" }),
    );
  });

  it("gera idempotência determinística e isolada por tenant", () => {
    expect(buildWorkflowIdempotencyKey(validEvent)).toBe("tenant-a:event-0001");
    expect(buildWorkflowIdempotencyKey({ ...validEvent, tenantId: "tenant-b" })).toBe("tenant-b:event-0001");
  });

  it("evita colisão por separadores presentes nos identificadores", () => {
    const first = buildWorkflowIdempotencyKey({ tenantId: "tenant:a", eventId: "event/1" });
    const second = buildWorkflowIdempotencyKey({ tenantId: "tenant", eventId: "a:event/1" });
    expect(first).not.toBe(second);
    expect(first).toBe("tenant%3Aa:event%2F1");
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar RED**

```bash
corepack pnpm exec vitest run server/workflow/workflowBoundary.test.ts
```

Expected: FAIL porque `server/workflow/workflowBoundary.ts` ainda não existe.

- [ ] **Step 3: Implementar a fronteira mínima**

Criar `server/workflow/workflowBoundary.ts`:

```ts
import {
  workflowEventEnvelopeSchema,
  type WorkflowEventEnvelope,
} from "../../shared/workflowIntegration/v1";

export type WorkflowBoundaryErrorCode =
  | "workflow_event_invalid"
  | "workflow_tenant_mismatch";

export class WorkflowBoundaryError extends Error {
  constructor(
    public readonly code: WorkflowBoundaryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkflowBoundaryError";
  }
}

export function parseTrustedWorkflowEvent(
  input: unknown,
  trustedTenantId: string,
): WorkflowEventEnvelope {
  const parsed = workflowEventEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new WorkflowBoundaryError(
      "workflow_event_invalid",
      "Envelope de evento de workflow inválido.",
    );
  }
  if (parsed.data.tenantId !== trustedTenantId) {
    throw new WorkflowBoundaryError(
      "workflow_tenant_mismatch",
      "Tenant do evento não corresponde ao contexto confiável.",
    );
  }
  return parsed.data;
}

export function buildWorkflowIdempotencyKey(
  event: Pick<WorkflowEventEnvelope, "tenantId" | "eventId">,
): string {
  return `${encodeURIComponent(event.tenantId)}:${encodeURIComponent(event.eventId)}`;
}
```

- [ ] **Step 4: Executar o teste e confirmar GREEN**

```bash
corepack pnpm exec vitest run server/workflow/workflowBoundary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Rodar também o contrato v1 para confirmar compatibilidade**

```bash
corepack pnpm exec vitest run server/workflowIntegrationContract.test.ts server/workflow/workflowBoundary.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit da microentrega**

```bash
git add server/workflow/workflowBoundary.ts server/workflow/workflowBoundary.test.ts
git commit -m "feat: adicionar fronteira confiável de eventos de workflow"
```

---

### Task 4: Endurecer a fronteira contra acoplamento, rede, processos e ativação acidental

**Files:**
- Modify: `server/workflowBoundaryArchitecture.test.ts`
- Modify: `docs/architecture/d012-workflow-boundary.md`

**Interfaces:**
- Consumes: arquivos das Tasks 1–3 e marcadores existentes de simulação.
- Produces: invariant test que falha se a D-012A ganhar persistência, rede, execução de processo ou remover a evidência de simulação do legado.

- [ ] **Step 1: Expandir o teste arquitetural com um requisito documental ainda ausente**

Adicionar ao teste de documentação a exigência das frases abaixo:

```ts
for (const required of [
  "sem chamada HTTP",
  "sem execução de processo",
  "sem alteração de estado de ocorrência",
]) {
  expect(doc).toContain(required);
}
```

E adicionar os testes de código:

```ts
function collectFiles(dir: string, predicate: (file: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(full, predicate);
    return predicate(full) ? [full] : [];
  });
}

const relative = (file: string) => path.relative(root, file).replaceAll(path.sep, "/");

it("mantém contratos e boundary livres de persistência, rede e execução de processos", () => {
  const files = [
    ...collectFiles(path.join(root, "shared", "workflowIntegration"), file => file.endsWith(".ts") && !file.endsWith(".test.ts")),
    path.join(root, "server", "workflow", "workflowBoundary.ts"),
  ];

  const forbidden = [
    /(?:from\s+|import\s*\()["'][^"']*(?:drizzle|mysql2|server\/db|\/db(?:\/|$)|\/schema(?:\/|$))/, 
    /node:child_process|child_process/,
    /\bDATABASE_URL\b/,
    /\bfetch\s*\(/,
    /\baxios\b/,
    /\bhttps?\.request\s*\(/,
    /\bexec\s*\(/,
    /\bspawn\s*\(/,
  ];

  const offenders = files.flatMap(file => {
    const source = fs.readFileSync(file, "utf8");
    return forbidden.some(rule => rule.test(source)) ? [relative(file)] : [];
  });

  expect(offenders).toEqual([]);
});

it("preserva a superfície legada explicitamente como simulação", () => {
  const executionsPage = fs.readFileSync(path.join(root, "client", "src", "pages", "ExecutionsPage.tsx"), "utf8");
  const executorTest = fs.readFileSync(path.join(root, "server", "workflowExecutor.test.ts"), "utf8");
  const transactionTest = fs.readFileSync(path.join(root, "server", "workflowExecutionTransactions.test.ts"), "utf8");

  expect(executionsPage).toContain("SIMULAÇÃO / MOCK");
  expect(executorTest).toContain("externalRequests: 0");
  expect(transactionTest).toContain("simulationOnly: true");
});
```

- [ ] **Step 2: Executar e confirmar RED documental**

```bash
corepack pnpm exec vitest run server/workflowBoundaryArchitecture.test.ts
```

Expected: FAIL porque as três frases de capacidades proibidas ainda não estão na documentação.

- [ ] **Step 3: Acrescentar seção de capacidades proibidas ao documento**

Adicionar em `docs/architecture/d012-workflow-boundary.md`:

```markdown
## Capacidades proibidas na D-012A

A D-012A permanece **sem chamada HTTP**, **sem execução de processo** e **sem alteração de estado de ocorrência**. Também permanece sem escrita de banco, sem credenciais externas e sem ativação do executor legado fora do modo simulado.
```

- [ ] **Step 4: Executar o teste e confirmar GREEN**

```bash
corepack pnpm exec vitest run server/workflowBoundaryArchitecture.test.ts
```

Expected: PASS.

- [ ] **Step 5: Rodar todos os testes novos D-012A**

```bash
corepack pnpm exec vitest run server/workflowBoundaryArchitecture.test.ts server/workflowIntegrationContract.test.ts server/workflow/workflowBoundary.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit da microentrega**

```bash
git add server/workflowBoundaryArchitecture.test.ts docs/architecture/d012-workflow-boundary.md
git commit -m "test: proteger limites de segurança D-012A"
```

---

### Task 5: Provar regressão zero do workflow simulado existente

**Files:**
- Read-only verification: `server/workflowExecutor.test.ts`
- Read-only verification: `server/workflowTransactions.test.ts`
- Read-only verification: `server/workflowExecutionTransactions.test.ts`
- Read-only verification: `server/workflows.router.test.ts`
- Read-only verification: `client/src/pages/ExecutionsPage.test.tsx`
- Read-only verification: `client/src/pages/WorkflowBuilderPage.full.test.tsx`

**Interfaces:**
- Consumes: runtime legado de simulação existente.
- Produces: evidência objetiva de que a D-012A não alterou comportamento, persistência, permissões ou UI legados.

- [ ] **Step 1: Executar a regressão focada do workflow existente**

```bash
corepack pnpm exec vitest run \
  server/workflowExecutor.test.ts \
  server/workflowTransactions.test.ts \
  server/workflowExecutionTransactions.test.ts \
  server/workflows.router.test.ts \
  client/src/pages/ExecutionsPage.test.tsx \
  client/src/pages/WorkflowBuilderPage.full.test.tsx
```

Expected: todos os testes PASS; o executor continua simulando chamadas externas, retries/dead-letter e auditoria existentes.

- [ ] **Step 2: Confirmar que arquivos fora do escopo não foram alterados**

```bash
git diff --name-only main...HEAD
```

Expected: não listar `server/db.ts`, `server/routers.ts`, `drizzle/schema.ts`, nenhum `drizzle/*.sql`, `client/src/pages/WorkflowBuilderPage.tsx` ou `client/src/pages/ExecutionsPage.tsx`.

- [ ] **Step 3: Se houver alteração fora do escopo, parar e remover somente a alteração D-012A indevida antes de seguir**

Não mascarar regressão ajustando testes legados. Qualquer necessidade real de alterar runtime deve ser reclassificada para D-012B/C e passar por novo gate de design/planejamento.

---

### Task 6: Executar gates completos e registrar evidência final D-012A

**Files:**
- Create: `docs/superpowers/reports/2026-09-13-d012a-workflow-boundary-contracts-verification.md`

**Interfaces:**
- Consumes: Tasks 1–5 concluídas.
- Produces: relatório auditável do candidato D-012A, sem promover/mesclar/deployar automaticamente.

- [ ] **Step 1: Executar os testes novos D-012A**

```bash
corepack pnpm exec vitest run server/workflowBoundaryArchitecture.test.ts server/workflowIntegrationContract.test.ts server/workflow/workflowBoundary.test.ts
```

Expected: PASS.

- [ ] **Step 2: Reexecutar regressão focada do workflow legado**

```bash
corepack pnpm exec vitest run \
  server/workflowExecutor.test.ts \
  server/workflowTransactions.test.ts \
  server/workflowExecutionTransactions.test.ts \
  server/workflows.router.test.ts \
  client/src/pages/ExecutionsPage.test.tsx \
  client/src/pages/WorkflowBuilderPage.full.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Executar security gate**

```bash
corepack pnpm security:check
```

Expected: PASS sem nova migration e sem regressão de invariantes de segurança.

- [ ] **Step 4: Executar TypeScript**

```bash
corepack pnpm check
```

Expected: PASS.

- [ ] **Step 5: Executar suíte unitária completa**

```bash
corepack pnpm test
```

Expected: PASS.

- [ ] **Step 6: Executar build de produção**

```bash
corepack pnpm build
```

Expected: PASS, aceitando apenas warnings já conhecidos e não bloqueantes do baseline.

- [ ] **Step 7: Confirmar novamente o diff restrito**

```bash
git diff --name-only main...HEAD
```

Expected: somente arquivos D-012A e documentação/relatório associados; nenhum schema, migration, router, executor ou UI legado alterado.

- [ ] **Step 8: Gerar o relatório somente depois dos gates GREEN**

Capturar o SHA real:

```bash
HEAD_SHA="$(git rev-parse HEAD)"
printf '%s\n' "$HEAD_SHA"
```

Criar `docs/superpowers/reports/2026-09-13-d012a-workflow-boundary-contracts-verification.md` registrando o SHA retornado e os resultados reais dos comandos acima. O relatório deve conter estas afirmações somente se verificadas pelos comandos:

```markdown
# D-012A — Workflow Boundary & Contracts — Verificação

## Escopo verificado

- contrato `shared/workflowIntegration/v1.ts` versionado e estrito;
- boundary pura para tenant confiável e idempotência;
- invariantes arquiteturais de ausência de persistência/rede/processos;
- workflow legado preservado como simulação/mock;
- nenhuma integração runtime do contrato D-012A.

## Gates

Registrar o SHA real e o resultado real de:
- testes D-012A;
- regressão focada do workflow legado;
- `corepack pnpm security:check`;
- `corepack pnpm check`;
- `corepack pnpm test`;
- `corepack pnpm build`.

## Restrições preservadas

- nenhuma migration criada ou aplicada;
- nenhum grant produtivo;
- nenhum deploy;
- nenhuma alteração em `server/db.ts` ou `server/routers.ts`;
- nenhuma alteração em `drizzle/schema.ts` ou migrations;
- nenhuma alteração nas páginas legadas de Workflow;
- nenhuma chamada externa habilitada;
- nenhuma mudança automática de estado de Ocorrência.

## Próximo gate

D-012A pode ser submetida à revisão/merge controlado. D-012B somente começa após aprovação explícita do responsável pelo projeto.
```

- [ ] **Step 9: Commit do relatório**

```bash
git add docs/superpowers/reports/2026-09-13-d012a-workflow-boundary-contracts-verification.md
git commit -m "docs: registrar verificação D-012A"
```

- [ ] **Step 10: Não fazer merge ou iniciar D-012B automaticamente**

Abrir/atualizar o PR da D-012A com evidências GREEN e aguardar aprovação explícita. Produção continua separada de desenvolvimento e homologação.

---

## Definition of Done — D-012A

A D-012A está pronta para revisão somente quando todos os itens abaixo forem verdadeiros ao mesmo tempo:

1. O contrato v1 aceita somente envelope/version/eventos/produtores permitidos e rejeita campos extras.
2. Tenant divergente falha fechado antes de qualquer efeito.
3. A chave de idempotência é determinística e isolada por tenant.
4. Contrato e boundary não importam persistência, não chamam rede e não executam processos.
5. O workflow existente continua explicitamente `SIMULAÇÃO / MOCK`, com `externalRequests: 0` e `simulationOnly: true` protegidos por testes.
6. Não há alteração em banco, migrations, tRPC, executor ou UI.
7. Regressão focada, security gate, TypeScript, suíte completa e build estão GREEN no mesmo candidato.
8. Relatório final registra o SHA e resultados reais.
9. Nenhum merge, deploy, migration ou grant foi executado automaticamente.

## Handoff para D-012B

D-012B deverá partir dos contratos aprovados aqui e decidir, em ciclo próprio, como reconciliar `WorkflowDefinition`/`WorkflowVersion` do desenho D-012 com as tabelas e funções simuladas já existentes. A D-012A deliberadamente não toma essa decisão de persistência/runtime.