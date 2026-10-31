import { statusLabels } from "./operational";

type StatusCode = keyof typeof statusLabels;

/** Only show a real audited transition; never infer one from incident.updatedAt. */
export function describeIncidentStatusTransition(event: {
  previousStatus?: StatusCode | null;
  nextStatus?: StatusCode | null;
}): string | null {
  if (!event.previousStatus || !event.nextStatus || event.previousStatus === event.nextStatus)
    return null;
  const from = statusLabels[event.previousStatus];
  const to = statusLabels[event.nextStatus];
  if (!from || !to) return null;
  return from + " → " + to;
}
