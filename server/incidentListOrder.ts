import {asc, desc, sql} from "drizzle-orm";
import {incidents} from "../drizzle/schema";
import {STAGE_ENTRY_EVENTS} from "./incidentStageMetrics";
import type {IncidentListInput} from "./db";

/** AXED-F015: SQL ordering precedes LIMIT/OFFSET; never infer absent stage times. */
export const auditedStageEntry = sql`(
  SELECT MAX(e.created_at) FROM incident_events e
  WHERE e.incident_id = ${incidents.id}
    AND e.next_status = ${incidents.status}
    AND e.event_type IN (${sql.join(STAGE_ENTRY_EVENTS.map(event => sql`${event}`), sql`, `)})
)`;

export function incidentListOrder(sortOrder: IncidentListInput["sortOrder"]) {
  switch (sortOrder) {
    case "stage-oldest":
      return [sql`CASE WHEN ${auditedStageEntry} IS NULL THEN 1 ELSE 0 END`, asc(auditedStageEntry), asc(incidents.id)];
    case "priority":
      return [desc(sql`CASE ${incidents.priority} WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 WHEN 'baixa' THEN 1 ELSE 0 END`), asc(incidents.createdAt), asc(incidents.id)];
    case "oldest": return [asc(incidents.createdAt), asc(incidents.id)];
    case "newest": return [desc(incidents.createdAt), asc(incidents.id)];
    default: return [desc(incidents.createdAt)];
  }
}
