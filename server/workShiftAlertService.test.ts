import { describe, expect, it } from "vitest";
import {
  acknowledgeWorkShiftAlert,
  evaluateWorkShiftAlerts,
  resolveWorkShiftAlert,
  type WorkShiftAlertEvaluationContext,
} from "./workShiftAlertService";

const now = new Date("2026-09-04T12:00:00.000Z");

function context(overrides: Partial<WorkShiftAlertEvaluationContext> = {}): WorkShiftAlertEvaluationContext {
  return {
    evaluatedAt: now,
    userId: 10,
    teamId: 20,
    sessionId: 30,
    plannedStartAt: new Date("2026-09-04T10:00:00.000Z"),
    plannedEndAt: new Date("2026-09-04T11:00:00.000Z"),
    actualStartAt: new Date("2026-09-04T10:10:00.000Z"),
    actualEndAt: null,
    status: "active",
    pausedSeconds: 0,
    availableForDispatch: false,
    legacyStateDivergence: false,
    coverageGap: false,
    policy: {
      notStartedGraceSeconds: 300,
      lateStartThresholdSeconds: 300,
      pauseExceededSeconds: 1800,
      shiftOverrunSeconds: 900,
      notEndedGraceSeconds: 900,
    },
    ...overrides,
  };
}

describe("D-007D3 deterministic work shift alerts", () => {
  it("detecta os tipos operacionais obrigatórios a partir de estado e policy explícitos", () => {
    const types = evaluateWorkShiftAlerts(context({
      actualStartAt: null,
      sessionId: null,
      status: null,
      coverageGap: true,
      availableForDispatch: true,
      legacyStateDivergence: true,
    })).map(alert => alert.type);

    expect(types).toContain("SHIFT_NOT_STARTED_NEAR_PLANNED_TIME");
    expect(types).toContain("COVERAGE_GAP");
    expect(types).toContain("AVAILABLE_OUTSIDE_SHIFT");
    expect(types).toContain("LEGACY_SHIFT_STATE_DIVERGENCE");
  });

  it("detecta atraso, pausa excedida, extrapolação e jornada sem encerramento", () => {
    const types = evaluateWorkShiftAlerts(context({
      status: "paused",
      pausedSeconds: 2400,
      actualStartAt: new Date("2026-09-04T10:10:00.000Z"),
      actualEndAt: null,
    })).map(alert => alert.type);

    expect(types).toContain("LATE_START");
    expect(types).toContain("PAUSE_EXCEEDED");
    expect(types).toContain("SHIFT_OVERRUN");
    expect(types).toContain("SHIFT_NOT_ENDED");
  });

  it("gera dedupeKey estável para a mesma condição aberta", () => {
    const first = evaluateWorkShiftAlerts(context());
    const second = evaluateWorkShiftAlerts(context());
    expect(second.map(alert => alert.dedupeKey)).toEqual(first.map(alert => alert.dedupeKey));
  });

  it("acknowledge e resolve preservam identidade e registram ator/data", () => {
    const [alert] = evaluateWorkShiftAlerts(context());
    const acknowledged = acknowledgeWorkShiftAlert(alert, { actorUserId: 99, at: new Date("2026-09-04T12:01:00.000Z") });
    expect(acknowledged).toMatchObject({ status: "acknowledged", acknowledgedByUserId: 99 });

    const resolved = resolveWorkShiftAlert(acknowledged, { actorUserId: 100, at: new Date("2026-09-04T12:02:00.000Z") });
    expect(resolved).toMatchObject({ status: "resolved", resolvedByUserId: 100, dedupeKey: alert.dedupeKey });
  });
});
