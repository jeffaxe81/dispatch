import { describe, expect, it } from "vitest";

const loadSchema = () => import("./workflowEventReceiptSchema.ts?raw");
const loadStore = () => import("./workflowEventReceiptStore.ts?raw");
const loadMigration = () => import("../../drizzle/0013_d012f_workflow_event_receipts.sql?raw");
const loadDrizzleConfig = () => import("../../drizzle.config.ts?raw");

describe("D-012F persistent workflow event receipts", () => {
  it("persiste um recibo lateral sem duplicar outboxes de outros dominios", async () => {
    const { default: source } = await loadSchema();

    expect(source).toContain('"workflow_event_receipts"');
    expect(source).toContain('tenantId: varchar("tenant_id"');
    expect(source).toContain('eventId: varchar("event_id"');
    expect(source).toContain('eventType: varchar("event_type"');
    expect(source).toContain('producer: varchar("producer"');
    expect(source).toContain('correlationId: varchar("correlation_id"');
    expect(source).toContain("workflowExecutionId");
    expect(source).toContain("failureCode");
    expect(source).toContain("workflow_event_receipts_tenant_event_unique");
    expect(source).not.toContain("form_domain_events");
    expect(source).not.toContain("incident_events");
  });

  it("garante deduplicacao persistente por tenantId + eventId e permite o mesmo eventId em outro tenant", async () => {
    const { default: migration } = await loadMigration();

    expect(migration).toContain("CREATE TABLE `workflow_event_receipts`");
    expect(migration).toContain("`tenant_id` varchar(128) NOT NULL");
    expect(migration).toContain("`event_id` varchar(160) NOT NULL");
    expect(migration).toContain("workflow_event_receipts_tenant_event_unique");
    expect(migration).toMatch(/UNIQUE INDEX[^\n]*\(`tenant_id`, `event_id`\)/);
    expect(migration).toContain("workflow_event_receipts_status_created_idx");
    expect(migration).toContain("workflow_event_receipts_correlation_idx");
  });

  it("faz claim fail-closed antes do efeito e trata corrida de chave unica como replay", async () => {
    const { default: source } = await loadStore();

    expect(source).toContain("claimWorkflowEventReceipt");
    expect(source).toContain("completeWorkflowEventReceipt");
    expect(source).toContain("workflowEventEnvelopeSchema.parse");
    expect(source).toContain('for("update")');
    expect(source).toContain("ER_DUP_ENTRY");
    expect(source).toContain("tenantId");
    expect(source).toContain("eventId");
    expect(source).toContain('status: "duplicate"');
    expect(source).not.toContain("formDomainEvents");
    expect(source).not.toContain("incidentEvents");
    expect(source).not.toContain("assetInventory");
  });

  it("registra o schema lateral no Drizzle", async () => {
    const { default: config } = await loadDrizzleConfig();
    expect(config).toContain("./server/workflow/workflowEventReceiptSchema.ts");
  });
});