import { describe, expect, it, vi } from "vitest";
import { createFormsComposition } from "./formComposition";

function adapter() {
  return {
    getTemplate: vi.fn(async ({ tenantId, id }) => ({ id, tenantId, status: "active" as const })),
    listTemplates: vi.fn(async ({ tenantId }) => [{ id: tenantId * 10, tenantId, status: "active" as const }]),
    getVersion: vi.fn(async ({ tenantId, id }) => ({ id, tenantId, formId: 3, version: 1, status: "published" as const, definition: { schemaVersion: 1, title: "F", fields: [] } })),
    listVersions: vi.fn(async () => []), getSubmission: vi.fn(async () => null), createDraft: vi.fn(), saveDraft: vi.fn(), publishVersion: vi.fn(), activateForm: vi.fn(), disableForm: vi.fn(), createBinding: vi.fn(), createSubmission: vi.fn(), appendRevision: vi.fn(), createAttachment: vi.fn(), appendDomainEvent: vi.fn(async input => input), listBindings: vi.fn(async () => []), listSubmissionsForIncident: vi.fn(async () => []),
  };
}

describe("D-008 composition", () => {
  it("cria repository e service isolados por tenant", async () => {
    const persistence = adapter();
    const audit = { append: vi.fn(async () => undefined) };
    const tenant7 = createFormsComposition({ tenantId: 7, persistence: persistence as any, audit });
    const tenant8 = createFormsComposition({ tenantId: 8, persistence: persistence as any, audit });
    await tenant7.repository.listTemplates();
    await tenant8.repository.listTemplates();
    expect(persistence.listTemplates).toHaveBeenNthCalledWith(1, { tenantId: 7 });
    expect(persistence.listTemplates).toHaveBeenNthCalledWith(2, { tenantId: 8 });
    expect(tenant7.service).not.toBe(tenant8.service);
  });

  it("persiste eventos do service no outbox do mesmo tenant", async () => {
    const persistence = adapter();
    const audit = { append: vi.fn(async () => undefined) };
    const composition = createFormsComposition({ tenantId: 7, persistence: persistence as any, audit });
    await composition.service.disableForm({ formId: 3, actorUserId: 9, now: new Date("2026-09-05T20:00:00Z") });
    expect(persistence.appendDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 7, eventType: "form.disabled", aggregateType: "form" }));
  });

  it("recusa composição sem tenant válido", () => {
    expect(() => createFormsComposition({ tenantId: 0, persistence: adapter() as any, audit: { append: vi.fn() } })).toThrow(/tenant/i);
  });
});
