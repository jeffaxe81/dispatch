import { describe, expect, it } from "vitest";
import {
  buildWorkShiftPendingDedupeKey,
  transitionWorkShiftPending,
  type WorkShiftPendingStatus,
} from "./workShiftOperationsDomain";

describe("D-007D work shift operations domain", () => {
  it("gera chave de deduplicação estável pelo tenant, usuário, anomalia, referência e janela", () => {
    expect(buildWorkShiftPendingDedupeKey({
      tenantId: 7,
      userId: 42,
      anomalyType: "missing_start",
      referenceId: "assignment:99",
      windowKey: "2026-09-05T08:00:00.000Z",
    })).toBe("7:42:missing_start:assignment:99:2026-09-05T08:00:00.000Z");
  });

  it.each<WorkShiftPendingStatus>([
    "open",
    "in_review",
    "waiting_information",
  ])("permite transição de open para %s sem justificativa terminal", nextStatus => {
    expect(transitionWorkShiftPending("open", nextStatus)).toEqual({ status: nextStatus, justification: null });
  });

  it.each<WorkShiftPendingStatus>(["resolved", "no_adjustment_required"])(
    "exige justificativa para estado terminal %s",
    nextStatus => {
      expect(() => transitionWorkShiftPending("in_review", nextStatus)).toThrow(/justificativa/i);
      expect(transitionWorkShiftPending("in_review", nextStatus, "Conferido pelo supervisor")).toEqual({
        status: nextStatus,
        justification: "Conferido pelo supervisor",
      });
    },
  );

  it.each<WorkShiftPendingStatus>(["resolved", "no_adjustment_required"])(
    "não permite reabrir estado terminal %s para open",
    currentStatus => {
      expect(() => transitionWorkShiftPending(currentStatus, "open", "tentativa de reabertura")).toThrow(/terminal|reabr/i);
    },
  );
});
