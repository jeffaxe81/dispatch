import { and, desc, eq } from "drizzle-orm";
import { auditLogs } from "../drizzle/schema";
import { getDb } from "./db";

/** F097: keep only a bounded, opaque permission identifier, never request data. */
export function normalizeDeniedPermissionCode(code: unknown): string {
  return typeof code === "string" && /^[a-z][a-z0-9_.:-]{0,79}$/.test(code) ? code : "unknown";
}

/** Never allow a failure in evidence recording to turn a denial into access. */
export async function recordDeniedPermission(userId: number, code: unknown): Promise<void> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return;
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(auditLogs).values({
      resourceType: "access_denied",
      resourceId: userId,
      action: "permission_denied",
      actorUserId: userId,
      beforeData: null,
      afterData: { permission: normalizeDeniedPermissionCode(code) },
    });
  } catch {
    // Denial remains FORBIDDEN even when the audit store is unavailable.
  }
}

/** Never expose a cross-user or cross-tenant audit stream to ordinary actors. */
export async function listOwnDeniedPermissions(userId: number, limit = 20) {
  if (!Number.isSafeInteger(userId) || userId <= 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Identificador ou limite de consulta inválido.");
  const db = await getDb();
  if (!db) throw new Error("Auditoria indisponível.");
  const rows = await db.select({
    id: auditLogs.id, createdAt: auditLogs.createdAt, afterData: auditLogs.afterData,
  }).from(auditLogs)
    .where(and(eq(auditLogs.resourceType, "access_denied"),
      eq(auditLogs.action, "permission_denied"),
      eq(auditLogs.actorUserId, userId),
      eq(auditLogs.resourceId, userId)))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(limit);
  return rows.map(row => ({
    id: row.id,
    occurredAt: row.createdAt,
    permission: normalizeDeniedPermissionCode(row.afterData?.permission),
  }));
}
