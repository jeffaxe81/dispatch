import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("D-012F architecture boundaries", () => {
  it("mantém o consumer desacoplado dos domínios produtores", () => {
    const service = source("./workflowEventTriggerService.ts");
    const persistence = source("./workflowEventTriggerPersistence.ts");

    for (const code of [service, persistence]) {
      expect(code).not.toMatch(/from\s+["'][^"']*forms\//);
      expect(code).not.toMatch(/from\s+["'][^"']*assetInventory/);
      expect(code).not.toMatch(/from\s+["'][^"']*incident(?:s|Lifecycle|Evidence)?/);
    }

    expect(service).not.toContain("../dbLegacy");
  });

  it("mantém adapters como única fronteira tipada para eventos externos", () => {
    const adapters = source("./workflowEventAdapters.ts");

    expect(adapters).toContain('import type { FormDomainEvent } from "../forms/formEvents"');
    expect(adapters).toContain('import type { AssetInventoryEvent } from "../assetInventoryEventConsumer"');
    expect(adapters).not.toMatch(/getDb|insert\(|update\(|delete\(/);
  });

  it("não cria outbox paralela para eventos dos domínios produtores", () => {
    const files = [
      source("./workflowEventTriggerService.ts"),
      source("./workflowEventTriggerPersistence.ts"),
      source("./workflowEventReceiptStore.ts"),
      source("./workflowEventReceiptSchema.ts"),
    ].join("\n");

    expect(files).not.toMatch(/form[_A-Za-z]*outbox|inventory[_A-Za-z]*outbox|incident[_A-Za-z]*outbox/i);
    expect(files).toContain("workflowEventReceipts");
  });
});
