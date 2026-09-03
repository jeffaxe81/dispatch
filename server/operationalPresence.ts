export type OperationalPresenceStatus =
  | "available"
  | "busy"
  | "paused"
  | "offline"
  | "out_of_shift";

export type TeamOperationalStatus =
  | "disponivel"
  | "em_deslocamento"
  | "em_atendimento"
  | "pausada"
  | "indisponivel";

export function isPresenceDispatchable(status: OperationalPresenceStatus) {
  return status === "available";
}

export function deriveOperationalPresence(input: {
  inShift: boolean;
  shiftPaused: boolean;
  teamStatus: TeamOperationalStatus;
  hasActiveIncident: boolean;
  online: boolean;
}): { status: OperationalPresenceStatus; availableForDispatch: boolean } {
  if (!input.inShift) {
    return { status: "out_of_shift", availableForDispatch: false };
  }

  if (input.shiftPaused || input.teamStatus === "pausada") {
    return { status: "paused", availableForDispatch: false };
  }

  if (!input.online || input.teamStatus === "indisponivel") {
    return { status: "offline", availableForDispatch: false };
  }

  if (
    input.hasActiveIncident ||
    input.teamStatus === "em_atendimento" ||
    input.teamStatus === "em_deslocamento"
  ) {
    return { status: "busy", availableForDispatch: false };
  }

  return { status: "available", availableForDispatch: true };
}
