import { describe, expect, it } from "vitest";
import { detectEventAnomalies } from "./workShiftAnomalyService";

const base = {
  tenantId: 7,
  userId: 42,
  teamId: 3,
  sessionId: 99,
  eventType: "ended" as const,
  occurredAt: new Date("2026-09-05T20:30:00.000Z"),
  snapshot: {
    scheduleAssignmentId: 12,
    scheduledStartAt: "2026-09-05T08:00:00.000Z",
    scheduledEndAt: "2026-09-05T20:00:00.000Z",
    lateStartSeconds: 0,
    earlyEndSeconds: 0,
    overtimeSeconds: 0,
    pausedSeconds: 0,
  },
};

describe("D-007D event anomaly detector", () => {
  it("detecta início atrasado", () => {
    const result = detectEventAnomalies({ ...base, eventType: "started", snapshot: { ...base.snapshot, lateStartSeconds: 600 } });
    expect(result.map(item => item.anomalyType)).toContain("late_start");
  });

  it("detecta encerramento antecipado", () => {
    const result = detectEventAnomalies({ ...base, snapshot: { ...base.snapshot, earlyEndSeconds: 900 } });
    expect(result.map(item => item.anomalyType)).toContain("early_end");
  });

  it("detecta hora extra", () => {
    const result = detectEventAnomalies({ ...base, snapshot: { ...base.snapshot, overtimeSeconds: 1800 } });
    expect(result.map(item => item.anomalyType)).toContain("overtime");
  });

  it("detecta pausa excessiva quando há política planejada", () => {
    const result = detectEventAnomalies({ ...base, eventType: "resumed", snapshot: { ...base.snapshot, pausedSeconds: 2400, breakPolicyMinutes: 30 } });
    expect(result.map(item => item.anomalyType)).toContain("excessive_pause");
  });

  it("não gera anomalia para evento normal", () => {
    expect(detectEventAnomalies(base)).toEqual([]);
  });
});
