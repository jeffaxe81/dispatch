import { and, inArray, max } from "drizzle-orm";
import { incidentEvents } from "../drizzle/schema";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type IncidentRow = { incident: { id: number; status: string } };
const STAGE_ENTRY_EVENTS = [
  "occurrence_created",
  "status_changed",
  "team_dispatched",
  "dispatch_accepted",
  "dispatch_declined",
] as const;

/**
 * F011: only historical transition events count as entry into a stage.
 * Never substitute incident.createdAt or incident.updatedAt for missing
 * stage history. The caller MUST already have applied RBAC and tenant scope
 * to the incident rows; this query only requests those visible IDs.
 */
export async function withIncidentStageEntry<T extends IncidentRow>(
  db: Db,
  authorizedRows: readonly T[],
): Promise<Array<T & { stageEnteredAt: Date | null }>> {
  if (!authorizedRows.length) return [];
  const ids = [...new Set(authorizedRows.map(row => row.incident.id))];
  const entries = await db.select({
    incidentId: incidentEvents.incidentId,
    nextStatus: incidentEvents.nextStatus,
    enteredAt: max(incidentEvents.createdAt),
  }).from(incidentEvents)
    .where(and(
      inArray(incidentEvents.incidentId, ids),
      inArray(incidentEvents.eventType, [...STAGE_ENTRY_EVENTS]),
    ))
    .groupBy(incidentEvents.incidentId, incidentEvents.nextStatus);

  const lookup = new Map<string, Date>();
  for (const entry of entries) {
    if (!entry.nextStatus || !entry.enteredAt) continue;
    const instant = new Date(entry.enteredAt);
    if (!Number.isFinite(instant.getTime())) continue;
    lookup.set(entry.incidentId + ":" + entry.nextStatus, instant);
  }
  return authorizedRows.map(row => ({
    ...row,
    stageEnteredAt: lookup.get(row.incident.id + ":" + row.incident.status) ?? null,
  }));
}
