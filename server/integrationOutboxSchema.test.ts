import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { integrationDeliveryOutbox } from "../drizzle/integrationDeliverySchema";

const tableName = (table: unknown) =>
  (table as { [key: symbol]: unknown })[Symbol.for("drizzle:Name")];

describe("D-012J J15 — outbox/DLQ persistente de integrações", () => {
  it("expõe tabela tenant-scoped de entrega com estado de outbox/DLQ", () => {
    expect(tableName(integrationDeliveryOutbox)).toBe("integration_delivery_outbox");
    expect(integrationDeliveryOutbox.organizationId).toBeDefined();
    expect(integrationDeliveryOutbox.system).toBeDefined();
    expect(integrationDeliveryOutbox.contractVersion).toBeDefined();
    expect(integrationDeliveryOutbox.mode).toBeDefined();
    expect(integrationDeliveryOutbox.operation).toBeDefined();
    expect(integrationDeliveryOutbox.messageId).toBeDefined();
    expect(integrationDeliveryOutbox.idempotencyKey).toBeDefined();
    expect(integrationDeliveryOutbox.correlationId).toBeDefined();
    expect(integrationDeliveryOutbox.status).toBeDefined();
    expect(integrationDeliveryOutbox.deliveryVersion).toBeDefined();
    expect(integrationDeliveryOutbox.deliveryAttempts).toBeDefined();
    expect(integrationDeliveryOutbox.maxAttempts).toBeDefined();
    expect(integrationDeliveryOutbox.failureThreshold).toBeDefined();
    expect(integrationDeliveryOutbox.cooldownSeconds).toBeDefined();
    expect(integrationDeliveryOutbox.payloadReference).toBeDefined();
    expect(integrationDeliveryOutbox.lastFailureKind).toBeDefined();
  });

  it("versiona migration aditiva com isolamento, idempotência e claim indexado", () => {
    const migration = readFileSync(
      new URL("../drizzle/0018_d012j_integration_delivery_outbox.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("CREATE TABLE `integration_delivery_outbox`");
    expect(migration).toContain("FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict");
    expect(migration).toContain("enum('pending','leased','delivered','dead_letter')");
    expect(migration).toContain("UNIQUE INDEX `integration_delivery_outbox_tenant_idempotency_unique`");
    expect(migration).toContain("`organization_id`,`idempotency_key`");
    expect(migration).toContain("INDEX `integration_delivery_outbox_claim_idx`");
    expect(migration).toContain("`organization_id`,`status`,`next_attempt_at_ms`");
  });

  it("não persiste payload, segredo, token, autorização, request ou response bruto", () => {
    const migration = readFileSync(
      new URL("../drizzle/0018_d012j_integration_delivery_outbox.sql", import.meta.url),
      "utf8",
    ).toLowerCase();

    for (const forbidden of [
      "`payload`",
      "`token`",
      "`authorization`",
      "`request_data`",
      "`response_data`",
      "`error_message`",
      "`stack`",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
    expect(migration).toContain("`payload_reference`");
  });

  it("registra 0018 no journal sem executar migration produtiva", () => {
    const journal = JSON.parse(
      readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    ) as { entries: Array<{ idx: number; tag: string }> };

    expect(journal.entries).toContainEqual(expect.objectContaining({
      idx: 18,
      tag: "0018_d012j_integration_delivery_outbox",
    }));
  });
});