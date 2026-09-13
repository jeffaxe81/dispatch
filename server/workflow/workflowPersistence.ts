import { and, eq } from "drizzle-orm";
import { auditLogs, workflowVersions, workflows } from "../../drizzle/schema";
import { buildWorkflowAuditLog, getDb, validateWorkflowDefinition } from "../dbLegacy";
import { assertWorkflowTenant } from "./workflowTenantAccess";
import { workflowPublicationPointers } from "./workflowPublicationSchema";

export async function setSimulatedWorkflowActive(input: { workflowId: number; organizationId: number; active: boolean; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  return db.transaction(async tx => {
    await assertWorkflowTenant(tx, input.workflowId, input.organizationId);

    const before = (await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1))[0];
    if (!before) throw new Error("Workflow não encontrado.");
    if (!before.simulationOnly) throw new Error("Esta entrega permite alterar somente workflows em modo de simulação.");

    const pointer = (await tx.select().from(workflowPublicationPointers).where(eq(workflowPublicationPointers.id, input.workflowId)).limit(1))[0];
    const latestVersion = (await tx.select().from(workflowVersions).where(and(eq(workflowVersions.workflowId, input.workflowId), eq(workflowVersions.version, before.currentVersion))).limit(1))[0];

    if (input.active) {
      const validation = validateWorkflowDefinition(latestVersion?.definition, { forPublication: true });
      if (!validation.valid) throw new Error(validation.errors.join(" "));
    }

    const now = new Date();
    const previousPublishedVersion = pointer?.publishedVersion ?? null;
    const publishedVersion = input.active ? before.currentVersion : previousPublishedVersion;
    const patch = input.active
      ? { status: "publicado" as const, active: true, publishedAt: before.publishedAt ?? now, updatedByUserId: input.actorUserId }
      : { active: false, updatedByUserId: input.actorUserId };

    await tx.update(workflows).set(patch).where(eq(workflows.id, input.workflowId));
    if (input.active) {
      await tx.update(workflowPublicationPointers).set({ publishedVersion }).where(eq(workflowPublicationPointers.id, input.workflowId));
    }

    await tx.insert(auditLogs).values(buildWorkflowAuditLog({
      workflowId: input.workflowId,
      actorUserId: input.actorUserId,
      action: input.active ? "publish_activate" : "deactivate",
      beforeData: {
        status: before.status,
        active: before.active,
        publishedAt: before.publishedAt?.toISOString() ?? null,
        publishedVersion: previousPublishedVersion,
      },
      afterData: {
        status: input.active ? "publicado" : before.status,
        active: input.active,
        publishedAt: input.active ? (before.publishedAt ?? now).toISOString() : before.publishedAt?.toISOString() ?? null,
        publishedVersion,
      },
    }));
  });
}
