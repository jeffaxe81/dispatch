import { z } from "zod";
import { INCIDENT_PRIORITIES, INCIDENT_STATUSES } from "../shared/operations";

/**
 * Intervalo de abertura: [openedFrom, openedBefore).
 * Limites validados antes de consultar, contar e paginar registros.
 */
export const incidentListInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z.enum(INCIDENT_STATUSES).optional(),
  priority: z.enum(INCIDENT_PRIORITIES).optional(),
  teamId: z.number().int().positive().optional(),
  openedFrom: z.coerce.date().optional(),
  openedBefore: z.coerce.date().optional(),
}).refine(
  input => !input.openedFrom || !input.openedBefore || input.openedFrom < input.openedBefore,
  { path: ["openedBefore"], message: "O fim do período deve ser posterior ao início." },
);
