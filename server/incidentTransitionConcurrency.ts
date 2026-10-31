import { TRPCError } from "@trpc/server";
import { INCIDENT_TRANSITIONS, type IncidentStatus } from "../shared/operations";

/**
 * F020: first guard for stale Kanban status moves.
 * Must be called while holding the incident row lock and before any UPDATE,
 * event insertion or audit insertion. Full revision-based CAS remains pending.
 */
export function assertCurrentIncidentTransition(
  currentStatus: IncidentStatus,
  nextStatus: IncidentStatus,
  expectedStatus?: IncidentStatus,
): void {
  if (expectedStatus !== undefined && currentStatus !== expectedStatus) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A ocorrência foi alterada por outra sessão. Recarregue a fila antes de tentar novamente.",
    });
  }
  if (!INCIDENT_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A situação atual da ocorrência não permite essa transição. Recarregue os dados.",
    });
  }
}
