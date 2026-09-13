import { auditLogs, workflowVersions, workflows } from "../../drizzle/schema";
import { buildWorkflowAuditLog, createInitialSimulatedWorkflowDefinition, getDb } from "../dbLegacy";
import { workflowTenantScopes } from "./workflowTenantScopeSchema";

export async function createSimulatedWorkflowWithTenant(input: {
  name: string;
  description?: string | null;
  organizationId: number;
  actorUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const definition = createInitialSimulatedWorkflowDefinition();
  return db.transaction(async tx => {
    const [created] = await tx.insert(workflows).values({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      status: "rascunho",
      active: false,
      currentVersion: 1,
      simulationOnly: true,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
    }).$returningId();

    const [version] = await tx.insert(workflowVersions).values({
      workflowId: created.id,
      version: 1,
      definition,
      validationReport: { valid: true, warnings: ["Workflow criado em modo SIMULAÇÃO / MOCK."] },
      changeSummary: "Versão inicial simulada",
      createdByUserId: input.actorUserId,
    }).$returningId();

    await tx.insert(workflowTenantScopes).values({
      workflowId: created.id,
      organizationId: input.organizationId,
    });

    await tx.insert(auditLogs).values(buildWorkflowAuditLog({
      workflowId: created.id,
      actorUserId: input.actorUserId,
      action: "create",
      beforeData: null,
      afterData: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        status: "rascunho",
        active: false,
        version: 1,
        versionId: version.id,
        simulationOnly: true,
        organizationId: input.organizationId,
      },
    }));

    return { id: created.id, versionId: version.id };
  });
}
