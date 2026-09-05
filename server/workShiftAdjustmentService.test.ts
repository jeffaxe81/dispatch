import { describe, expect, it } from "vitest";
import {
  approveWorkShiftAdjustment,
  rejectWorkShiftAdjustment,
  requestWorkShiftAdjustment,
  type WorkShiftAdjustmentSnapshot,
} from "./workShiftAdjustmentService";

const baseSession: WorkShiftAdjustmentSnapshot = {
  id: 77,
  userId: 501,
  teamId: 9,
  scheduleAssignmentId: 33,
  scheduledStartAt: new Date("2026-09-04T08:00:00.000Z"),
  scheduledEndAt: new Date("2026-09-04T20:00:00.000Z"),
  startedAt: new Date("2026-09-04T08:15:00.000Z"),
  pausedAt: null,
  endedAt: new Date("2026-09-04T19:30:00.000Z"),
  status: "ended",
  pausedSeconds: 1800,
  workedSeconds: 38700,
  overtimeSeconds: 0,
  lateStartSeconds: 900,
  earlyEndSeconds: 1800,
};

describe("D-007D1 work shift adjustment domain", () => {
  it("creates a pending adjustment with a server-side before snapshot", () => {
    const requested = requestWorkShiftAdjustment({
      session: baseSession,
      requestedByUserId: 10,
      reason: "Correção de encerramento",
      changes: { endedAt: new Date("2026-09-04T20:00:00.000Z") },
      now: new Date("2026-09-04T21:00:00.000Z"),
    });

    expect(requested.status).toBe("pending");
    expect(requested.beforeSnapshot).toEqual(baseSession);
    expect(requested.requestedChanges).toEqual({ endedAt: new Date("2026-09-04T20:00:00.000Z") });
  });

  it("recalculates derived values on approval instead of trusting client-derived fields", () => {
    const requested = requestWorkShiftAdjustment({
      session: baseSession,
      requestedByUserId: 10,
      reason: "Correção de jornada",
      changes: {
        startedAt: new Date("2026-09-04T08:00:00.000Z"),
        endedAt: new Date("2026-09-04T20:30:00.000Z"),
        pausedSeconds: 1800,
      },
      now: new Date("2026-09-04T21:00:00.000Z"),
    });

    const approved = approveWorkShiftAdjustment({
      adjustment: requested,
      currentSession: baseSession,
      decidedByUserId: 20,
      now: new Date("2026-09-04T21:10:00.000Z"),
    });

    expect(approved.status).toBe("approved");
    expect(approved.afterSnapshot.workedSeconds).toBe(43200);
    expect(approved.afterSnapshot.lateStartSeconds).toBe(0);
    expect(approved.afterSnapshot.earlyEndSeconds).toBe(0);
    expect(approved.afterSnapshot.overtimeSeconds).toBe(0);
  });

  it("fails closed when the session changed after the request", () => {
    const requested = requestWorkShiftAdjustment({
      session: baseSession,
      requestedByUserId: 10,
      reason: "Correção",
      changes: { endedAt: new Date("2026-09-04T20:00:00.000Z") },
      now: new Date("2026-09-04T21:00:00.000Z"),
    });

    expect(() => approveWorkShiftAdjustment({
      adjustment: requested,
      currentSession: { ...baseSession, pausedSeconds: 2400 },
      decidedByUserId: 20,
      now: new Date("2026-09-04T21:10:00.000Z"),
    })).toThrow(/changed|alterada/i);
  });

  it("rejects without producing an after snapshot", () => {
    const requested = requestWorkShiftAdjustment({
      session: baseSession,
      requestedByUserId: 10,
      reason: "Correção",
      changes: { teamId: 12 },
      now: new Date("2026-09-04T21:00:00.000Z"),
    });

    const rejected = rejectWorkShiftAdjustment({
      adjustment: requested,
      decidedByUserId: 20,
      reason: "Sem evidência suficiente",
      now: new Date("2026-09-04T21:05:00.000Z"),
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.afterSnapshot).toBeNull();
  });

  it("does not accept client-derived counters inside requested changes", () => {
    expect(() => requestWorkShiftAdjustment({
      session: baseSession,
      requestedByUserId: 10,
      reason: "Tentativa inválida",
      changes: { workedSeconds: 999999 } as never,
      now: new Date("2026-09-04T21:00:00.000Z"),
    })).toThrow(/unsupported|não permitida|invalid/i);
  });
});
