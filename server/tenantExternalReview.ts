import { eq } from "drizzle-orm";
import { incidentTenantScopes } from "../drizzle/tenantScopeSchema";
import { confirmExternalIncidentReview, getDb } from "./db";

export async function confirmExternalIncidentReviewForTenant(input: {
  tenantId: number;
  reviewId: number;
  actorUserId: number;
}) {
  const result = await confirmExternalIncidentReview({
    reviewId: input.reviewId,
    actorUserId: input.actorUserId,
  });

  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível ao vincular a ocorrência externa ao tenant.");

  const existing = (await db
    .select({ organizationId: incidentTenantScopes.organizationId })
    .from(incidentTenantScopes)
    .where(eq(incidentTenantScopes.incidentId, result.incident.id))
    .limit(1))[0];

  if (existing && existing.organizationId !== input.tenantId) {
    throw new Error("A ocorrência externa já está vinculada a outro tenant.");
  }

  if (!existing) {
    await db.insert(incidentTenantScopes).values({
      incidentId: result.incident.id,
      organizationId: input.tenantId,
    });
  }

  return result;
}
