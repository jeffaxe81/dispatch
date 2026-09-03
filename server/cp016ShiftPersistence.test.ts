import { describe, expect, it } from "vitest";
import { executeCp016ShiftPersistence, type Cp016ShiftPersistenceAdapter } from "./cp016ShiftPersistence";

type Call = { name: string; payload: unknown };

function makeAdapter(options?: { activeSession?: any; teamStatus?: "disponivel" | "em_deslocamento" | "em_atendimento" | "pausada" | "indisponivel" }) {
  const calls: Call[] = [];
  const adapter: Cp016ShiftPersistenceAdapter = {
    getTeamSnapshot: async teamId => ({
      id: teamId,
      shiftStartedAt: options?.activeSession?.startedAt ?? null,
      shiftPausedAt: options?.activeSession?.pausedAt ?? null,
      shiftEndsAt: null,
      shiftPausedTotalSeconds: options?.activeSession?.totalPauseSeconds ?? 0,
      status: options?.teamStatus ?? "disponivel",
    }),
    getActiveSession: async () => options?.activeSession ?? null,
    updateTeamSnapshot: async (teamId, patch) => calls.push({ name: "team", payload: { teamId, patch } }),
    createSession: async values => {
      calls.push({ name: "createSession", payload: values });
      return 41;
    },
    updateSession: async (sessionId, patch) => calls.push({ name: "updateSession", payload: { sessionId, patch } }),
    appendSessionEvent: async values => calls.push({ name: "event", payload: values }),
    upsertPresence: async values => calls.push({ name: "presence", payload: values }),
    appendAuditLog: async values => calls.push({ name: "audit", payload: values }),
  };
  return { adapter, calls };
}

describe("CP-016 shift persistence orchestration", () => {
  it("persists team snapshot, historical session, event, presence and audit for start", async () => {
    const { adapter, calls } = makeAdapter();
    const now = new Date("2026-09-03T08:00:00.000Z");

    const result = await executeCp016ShiftPersistence({ teamId: 5, actorUserId: 9, action: "start", now }, adapter);

    expect(result).toEqual({ success: true, workSessionId: 41, eventType: "start" });
    expect(calls.map(call => call.name)).toEqual(["team", "createSession", "event", "presence", "audit"]);
    expect(calls.find(call => call.name === "createSession")?.payload).toMatchObject({ teamId: 5, userId: null, status: "open", source: "manual" });
    expect(calls.find(call => call.name === "event")?.payload).toMatchObject({ workSessionId: 41, actorUserId: 9, eventType: "start" });
  });

  it("updates the same active session on pause", async () => {
    const startedAt = new Date("2026-09-03T08:00:00.000Z");
    const { adapter, calls } = makeAdapter({
      activeSession: { id: 41, startedAt, pausedAt: null, endedAt: null, totalPauseSeconds: 0, status: "open" },
    });

    await executeCp016ShiftPersistence({ teamId: 5, actorUserId: 9, action: "pause", now: new Date("2026-09-03T10:00:00.000Z") }, adapter);

    expect(calls.map(call => call.name)).toEqual(["team", "updateSession", "event", "presence", "audit"]);
    expect(calls.find(call => call.name === "updateSession")?.payload).toMatchObject({ sessionId: 41, patch: { status: "paused" } });
    expect(calls.find(call => call.name === "presence")?.payload).toMatchObject({ teamId: 5, workSessionId: 41, status: "paused", availableForDispatch: false });
  });

  it("keeps the operation atomic at the adapter boundary by failing before writes when the team does not exist", async () => {
    const { adapter, calls } = makeAdapter();
    adapter.getTeamSnapshot = async () => null;

    await expect(executeCp016ShiftPersistence({ teamId: 999, actorUserId: 9, action: "start" }, adapter)).rejects.toThrow("Equipe não encontrada");
    expect(calls).toEqual([]);
  });
});
