export type WorkShiftState = "fora_jornada" | "em_jornada" | "em_intervalo" | "encerrada";

export type WorkShiftSnapshot = {
  state: WorkShiftState;
  startedAt: Date | null;
  breakStartedAt: Date | null;
  endedAt: Date | null;
};

export type WorkShiftCommand =
  | { type: "iniciar"; at: Date }
  | { type: "iniciar_intervalo"; at: Date }
  | { type: "retomar"; at: Date };

export function transitionWorkShift(
  current: WorkShiftSnapshot,
  command: WorkShiftCommand,
): WorkShiftSnapshot {
  if (current.state === "fora_jornada" && command.type === "iniciar") {
    return {
      state: "em_jornada",
      startedAt: command.at,
      breakStartedAt: null,
      endedAt: null,
    };
  }

  if (current.state === "em_jornada" && command.type === "iniciar_intervalo") {
    return {
      state: "em_intervalo",
      startedAt: current.startedAt,
      breakStartedAt: command.at,
      endedAt: null,
    };
  }

  if (current.state === "em_intervalo" && command.type === "retomar") {
    return {
      state: "em_jornada",
      startedAt: current.startedAt,
      breakStartedAt: null,
      endedAt: null,
    };
  }

  return current;
}
