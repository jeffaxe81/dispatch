import { eq } from "drizzle-orm";
import { auditLogs } from "../drizzle/schema";
import { embeddedIntegrations } from "../drizzle/schema.cp016";
import type { OperationalRole } from "../shared/operations";
import { getDb } from "./db";
import { prepareEmbeddedIntegrationRecord } from "./embeddedIntegrationPersistence";

export async function listEmbeddedIntegrationsForRole(role: OperationalRole) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const rows = await db.select().from(embeddedIntegrations).where(eq(embeddedIntegrations.enabled, true));
  return rows.filter(row => row.allowedRoles.includes(role));
}

export async function listEmbeddedIntegrationsForAdministration() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db.select().from(embeddedIntegrations);
}

export async function saveEmbeddedIntegration(input: {
  code: string;
  name: string;
  url: string;
  enabled: boolean;
  displayMode: "embedded" | "fullscreen" | "split";
  allowedRoles: string[];
  actorUserId: number;
  integrationConnectionId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const record = prepareEmbeddedIntegrationRecord({
    ...input,
    integrationConnectionId: input.integrationConnectionId ?? null,
  });

  return db.transaction(async tx => {
    const before = (
      await tx
        .select()
        .from(embeddedIntegrations)
        .where(eq(embeddedIntegrations.code, record.code))
        .limit(1)
    )[0];

    if (before) {
      await tx
        .update(embeddedIntegrations)
        .set({
          name: record.name,
          url: record.url,
          enabled: record.enabled,
          displayMode: record.displayMode,
          allowedRoles: record.allowedRoles,
          integrationConnectionId: record.integrationConnectionId,
          updatedByUserId: input.actorUserId,
        })
        .where(eq(embeddedIntegrations.id, before.id));

      const after = (
        await tx.select().from(embeddedIntegrations).where(eq(embeddedIntegrations.id, before.id)).limit(1)
      )[0];
      if (!after) throw new Error("Falha ao atualizar a integração embutida.");

      await tx.insert(auditLogs).values({
        resourceType: "embedded_integration",
        resourceId: before.id,
        action: "update",
        actorUserId: input.actorUserId,
        beforeData: sanitizeEmbeddedIntegrationAudit(before),
        afterData: sanitizeEmbeddedIntegrationAudit(after),
      });
      return after;
    }

    const [createdId] = await tx.insert(embeddedIntegrations).values(record).$returningId();
    const created = (
      await tx.select().from(embeddedIntegrations).where(eq(embeddedIntegrations.id, createdId.id)).limit(1)
    )[0];
    if (!created) throw new Error("Falha ao criar a integração embutida.");

    await tx.insert(auditLogs).values({
      resourceType: "embedded_integration",
      resourceId: created.id,
      action: "create",
      actorUserId: input.actorUserId,
      beforeData: null,
      afterData: sanitizeEmbeddedIntegrationAudit(created),
    });
    return created;
  });
}

function sanitizeEmbeddedIntegrationAudit(row: typeof embeddedIntegrations.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    url: row.url,
    enabled: row.enabled,
    displayMode: row.displayMode,
    allowedRoles: row.allowedRoles,
    integrationConnectionId: row.integrationConnectionId,
  };
}
