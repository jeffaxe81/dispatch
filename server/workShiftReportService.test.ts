import { describe, expect, it } from "vitest";
import { buildWorkShiftReport } from "./workShiftReportService";

const evaluatedAt = new Date("2026-09-04T21:00:00.000Z");

const baseSession = {
  id: 1,
  userId: 101,
  teamId: 9,
  scheduleAssignmentId: 33,
  scheduledStartAt: new Date("2026-09-04T08:00:00.000Z"),
  scheduledEndAt: new Date("2026-09-04T20:00:00.000Z"),
  startedAt: new Date("2026-09-04T08:15:00.000Z"),
  pausedAt: null,
  endedAt: new Date("2026-09-04T19:30:00.000Z"),
  status: "ended" as const,
  pausedSeconds: 1800,
  workedSeconds: 38700,
  overtimeSeconds: 0,
  lateStartSeconds: 900,
  earlyEndSeconds: 1800,
};

describe("D-007D2 work shift report projection", () => {
  it("consolida planejado x realizado sem mutar a sessão", () => {
    const original = structuredClone(baseSession);
    const report = buildWorkShiftReport({ sessions: [baseSession], evaluatedAt });

    expect(report.summary).toMatchObject({
      plannedSeconds: 43200,
      workedSeconds: 38700,
      pausedSeconds: 1800,
      overtimeSeconds: 0,
      lateStartSeconds: 900,
      earlyEndSeconds: 1800,
    });
    expect(baseSession).toEqual(original);
  });

  it("calcula sessão ativa no instante explícito de avaliação", () => {
    const active = {
      ...baseSession,
      id: 2,
      startedAt: new Date("2026-09-04T18:00:00.000Z"),
      endedAt: null,
      status: "active" as const,
      pausedSeconds: 600,
      workedSeconds: 0,
    };

    const report = buildWorkShiftReport({ sessions: [active], evaluatedAt });
    expect(report.rows[0]).toMatchObject({ sessionId: 2, status: "active", workedSeconds: 10200 });
  });

  it("marca sessão sem encerramento e preserva filtros por usuário/equipe/status", () => {
    const open = { ...baseSession, id: 3, userId: 102, teamId: 10, endedAt: null, status: "paused" as const };
    const report = buildWorkShiftReport({
      sessions: [baseSession, open],
      evaluatedAt,
      filters: { userId: 102, teamId: 10, status: "paused" },
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ sessionId: 3, missingEnd: true, status: "paused" });
  });

  it("indica presença de ajuste aprovado sem alterar os valores fornecidos pelo read model", () => {
    const report = buildWorkShiftReport({
      sessions: [baseSession],
      evaluatedAt,
      approvedAdjustmentSessionIds: new Set([1]),
    });

    expect(report.rows[0]).toMatchObject({ sessionId: 1, hasApprovedAdjustment: true });
  });

  it("filtra pelo período usando sobreposição temporal da sessão", () => {
    const report = buildWorkShiftReport({
      sessions: [baseSession],
      evaluatedAt,
      filters: {
        from: new Date("2026-09-05T00:00:00.000Z"),
        to: new Date("2026-09-05T23:59:59.999Z"),
      },
    });

    expect(report.rows).toEqual([]);
  });
});
