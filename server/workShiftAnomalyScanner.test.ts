import { describe, expect, it } from "vitest";
import { scanExpectedWorkShiftAnomalies, type WorkShiftAnomalyScanStore } from "./workShiftAnomalyService";

const now = new Date("2026-09-05T20:30:00.000Z");

function store(overrides: Partial<WorkShiftAnomalyScanStore> = {}): WorkShiftAnomalyScanStore {
  return {
    listExpectedWindows: async () => [],
    findSessionForWindow: async () => null,
    ...overrides,
  };
}

describe("D-007D periodic anomaly safety scan", () => {
  it("detecta missing_start quando a escala começou e não existe sessão", async () => {
    const result = await scanExpectedWorkShiftAnomalies({ tenantId: 7, now }, store({
      listExpectedWindows: async () => [{ userId: 42, teamId: 3, assignmentId: 12, plannedStartAt: new Date("2026-09-05T20:00:00.000Z"), plannedEndAt: new Date("2026-09-06T08:00:00.000Z"), breakPolicyMinutes: 30 }],
    }));
    expect(result.map(item => item.anomalyType)).toEqual(["missing_start"]);
  });

  it("detecta missing_end quando a escala terminou e a sessão continua aberta", async () => {
    const result = await scanExpectedWorkShiftAnomalies({ tenantId: 7, now }, store({
      listExpectedWindows: async () => [{ userId: 42, teamId: 3, assignmentId: 12, plannedStartAt: new Date("2026-09-05T08:00:00.000Z"), plannedEndAt: new Date("2026-09-05T20:00:00.000Z"), breakPolicyMinutes: 30 }],
      findSessionForWindow: async () => ({ id: 99, status: "active", pausedAt: null, pausedSeconds: 0 }),
    }));
    expect(result.map(item => item.anomalyType)).toEqual(["missing_end"]);
  });

  it("detecta pausa corrente acima da política", async () => {
    const result = await scanExpectedWorkShiftAnomalies({ tenantId: 7, now }, store({
      listExpectedWindows: async () => [{ userId: 42, teamId: 3, assignmentId: 12, plannedStartAt: new Date("2026-09-05T08:00:00.000Z"), plannedEndAt: new Date("2026-09-06T08:00:00.000Z"), breakPolicyMinutes: 30 }],
      findSessionForWindow: async () => ({ id: 99, status: "paused", pausedAt: new Date("2026-09-05T19:50:00.000Z"), pausedSeconds: 1500 }),
    }));
    expect(result.map(item => item.anomalyType)).toContain("excessive_pause");
  });

  it("mantém a mesma dedupe key em varreduras repetidas da mesma janela", async () => {
    const scanStore = store({ listExpectedWindows: async () => [{ userId: 42, teamId: 3, assignmentId: 12, plannedStartAt: new Date("2026-09-05T20:00:00.000Z"), plannedEndAt: new Date("2026-09-06T08:00:00.000Z"), breakPolicyMinutes: null }] });
    const first = await scanExpectedWorkShiftAnomalies({ tenantId: 7, now }, scanStore);
    const second = await scanExpectedWorkShiftAnomalies({ tenantId: 7, now: new Date(now.getTime() + 60_000) }, scanStore);
    expect(second[0].dedupeKey).toBe(first[0].dedupeKey);
  });
});
