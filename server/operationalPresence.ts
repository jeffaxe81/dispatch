import type { OperationalPresenceStatus } from "../shared/operations";
import type { teams } from "../drizzle/schema";

type TeamStatus = typeof teams.$inferSelect.status;

export type OperationalPresenceState = {
  status: OperationalPresenceStatus;
  availableForDispatch: boolean;
};

export function resolveOperationalPresenceState(input: {
  inShift: boolean;
  shiftPaused?: boolean;
  teamStatus: TeamStatus;
}): OperationalPresenceState {
  if (!input.inShift) {
    return { status: "out_of_shift", availableForDispatch: false };
  }

  if (input.shiftPaused) {
    return { status: "paused", availableForDispatch: false };
  }

  switch (input.teamStatus) {
    case "disponivel":
      return { status: "available", availableForDispatch: true };
    case "pausada":
      return { status: "paused", availableForDispatch: false };
    case "em_atendimento":
    case "em_deslocamento":
      return { status: "busy", availableForDispatch: false };
    default:
      return { status: "offline", availableForDispatch: false };
  }
}
