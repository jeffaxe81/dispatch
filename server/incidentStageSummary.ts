import {and, eq, sql, type SQL} from "drizzle-orm";
import {incidents} from "../drizzle/schema";
import {incidentTenantScopes} from "../drizzle/tenantScopeSchema";
import type {getDb} from "./db";
import {auditedStageEntry} from "./incidentListOrder";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type IncidentStageSummary = {total: number; observed: number; averageMinutes: number | null};

/**
 * F012: global aggregate before pagination. No data from other tenants:
 * authorization WHERE is inherited, AND tenant scope is repeated in this query.
 * A stage without audited entry is unknown and excluded from the mean.
 */
export function normalizeIncidentStageSummary(row: {total: unknown; observed: unknown; averageMinutes: unknown}): IncidentStageSummary {
  const total = Number(row.total);
  const observed = Number(row.observed);
  const average = row.averageMinutes === null || row.averageMinutes === undefined ? null : Number(row.averageMinutes);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(observed) || total < 0 || observed < 0 || observed > total ||
    (average !== null && (!Number.isFinite(average) || average < 0)) ||
    (observed === 0 && average !== null) || (observed > 0 && average === null)) {
    throw new Error("Agregado de tempo na etapa inconsistente.");
  }
  return {total, observed, averageMinutes: average};
}
export async function fetchIncidentStageSummary(db: Db, where: SQL | undefined, tenantId?: number): Promise<IncidentStageSummary> {
  const projection = {
    total: sql<number>`COUNT(${incidents.id})`,
    observed: sql<number>`COUNT(${auditedStageEntry})`,
    averageMinutes: sql<number | null>`ROUND(AVG(GREATEST(0, TIMESTAMPDIFF(SECOND, ${auditedStageEntry}, CURRENT_TIMESTAMP())) / 60), 0)`,
  };
  if (tenantId !== undefined) {
    if (!Number.isSafeInteger(tenantId) || tenantId <= 0) throw new Error("Tenant inválido para agregado de etapas.");
    const rows = await db.select(projection).from(incidents)
      .innerJoin(incidentTenantScopes, eq(incidentTenantScopes.incidentId, incidents.id))
      .where(and(where, eq(incidentTenantScopes.organizationId, tenantId)));
    return normalizeIncidentStageSummary(rows[0] ?? {total: 0, observed: 0, averageMinutes: null});
  }
  const rows = await db.select(projection).from(incidents).where(where);
  return normalizeIncidentStageSummary(rows[0] ?? {total: 0, observed: 0, averageMinutes: null});
}
