export type WorkShiftState = "fora_jornada" | "em_jornada" | "em_intervalo" | "encerrada";

export type WorkShiftSnapshot = {
  state: WorkShiftState;
  startedAt: Date | null;
  breakStartedAt: Date | null;
  endedAt: Date | null;
};

export type WorkShiftCommand =
  | { type: "iniciar"; at: Date };

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

  return current;
}
