import { TRPCError } from "@trpc/server";
import { INCIDENT_TRANSITIONS, type IncidentStatus } from "../shared/operations";

/**
 * F020: a status and its monotonic revision are checked while holding the incident row lock.
 * Status-only fallback remains for older API consumers until a contract migration.
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

/** CAS check rejects a stale view even if the status returned to the same value (ABA). */
export function assertExpectedIncidentStatusRevision(currentRevision: number, expectedRevision?: number): void {
  if (!Number.isSafeInteger(currentRevision) || currentRevision <= 0)
    throw new TRPCError({code:"CONFLICT",message:"Revisão da ocorrência inválida. Recarregue a fila."});
  if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0 || currentRevision !== expectedRevision))
    throw new TRPCError({code:"CONFLICT",message:"A ocorrência foi alterada desde a última consulta. Recarregue a fila antes de tentar novamente."});
}
