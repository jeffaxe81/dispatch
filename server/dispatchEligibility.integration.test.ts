import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { auditLogs, incidentAssignments, incidentEvents, incidents, teams, users } from "../drizzle/schema";
import { operationalPresence, workSessionEvents, workSessions } from "../drizzle/cp016Schema";
import { assignTeamToIncident, setDbForTesting } from "./db";

describe("CP-016 dispatch eligibility on disposable MySQL", () => {
  let pool: mysql.Pool | undefined;
  let db: ReturnType<typeof drizzle>;
  let actorId: number;
  let teamId: number;
  let incidentId: number;
  let incidentIds: number[] = [];

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (process.env.CP016_DISPOSABLE_DB !== "1" || url.hostname !== "127.0.0.1" || url.pathname !== "/dispatch_cp016_ci") {
      throw new Error("CP-016 dispatch tests require the explicitly disposable local CI database.");
    }
    pool = mysql.createPool({ uri: url.toString(), timezone: "Z", connectionLimit: 4 });
    db = drizzle(pool);
    setDbForTesting(db);
    const [actor] = await db.insert(users).values({ openId: `dispatch:${randomUUID()}`, name: "Dispatch test actor" }).$returningId();
    actorId = actor.id;
  });

  beforeEach(async () => {
    const token = randomUUID().replaceAll("-", "").slice(0, 20);
    const [team] = await db.insert(teams).values({ code: `d-${token}`, name: "Disposable dispatch team", agency: "CI" }).$returningId();
    teamId = team.id;
    const [incident] = await db.insert(incidents).values({ code: `i-${token}`, category: "CI", description: "Disposable eligibility fixture", address: "CI", latitude: "-27.0000000", longitude: "-48.0000000", createdByUserId: actorId }).$returningId();
    incidentId = incident.id;
    incidentIds = [incident.id];
  });

  afterEach(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.actorUserId, actorId));
    for (const id of incidentIds) {
      await db.delete(incidentEvents).where(eq(incidentEvents.incidentId, id));
      await db.delete(incidentAssignments).where(eq(incidentAssignments.incidentId, id));
      await db.delete(incidents).where(eq(incidents.id, id));
    }
    const sessions = await db.select({ id: workSessions.id }).from(workSessions).where(eq(workSessions.teamId, teamId));
    for (const session of sessions) await db.delete(workSessionEvents).where(eq(workSessionEvents.workSessionId, session.id));
    await db.delete(operationalPresence).where(eq(operationalPresence.teamId, teamId));
    await db.delete(workSessions).where(eq(workSessions.teamId, teamId));
    await db.delete(teams).where(eq(teams.id, teamId));
  });

  afterAll(async () => {
    try {
      await db.delete(users).where(eq(users.id, actorId));
    } finally {
      setDbForTesting(null);
      await pool?.end();
    }
  });

  async function setCandidate(state: "available" | "paused" | "busy" | "out_of_shift") {
    const inShift = state !== "out_of_shift";
    const [session] = await db.insert(workSessions).values({ teamId, userId: actorId, startedAt: new Date("2026-09-05T08:00:00Z"), status: inShift ? (state === "paused" ? "paused" : "open") : "closed", endedAt: inShift ? null : new Date("2026-09-05T09:00:00Z") }).$returningId();
    await db.update(teams).set({ shiftStartedAt: new Date("2026-09-05T08:00:00Z"), shiftEndsAt: inShift ? null : new Date("2026-09-05T09:00:00Z"), shiftPausedAt: state === "paused" ? new Date("2026-09-05T08:30:00Z") : null, status: state === "busy" ? "em_atendimento" : "disponivel" }).where(eq(teams.id, teamId));
    await db.insert(operationalPresence).values({ teamId, userId: actorId, workSessionId: session.id, status: state, availableForDispatch: state === "available", lastChangedAt: new Date("2026-09-05T09:00:00Z") });
    return session.id;
  }

  async function expectIncidentUnchanged() {
    const incident = (await db.select().from(incidents).where(eq(incidents.id, incidentId)))[0];
    expect(incident).toMatchObject({ status: "triagem", assignedTeamId: null, dispatchedAt: null });
    expect(await db.select().from(incidentAssignments).where(eq(incidentAssignments.incidentId, incidentId))).toEqual([]);
    expect(await db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, incidentId))).toEqual([]);
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.resourceType, "incident"), eq(auditLogs.resourceId, incidentId)))).toEqual([]);
  }

  it.each([
    ["missing presence", null],
    ["paused", "paused"],
    ["busy", "busy"],
    ["out of shift", "out_of_shift"],
  ] as const)("rejects %s without partially assigning the incident", async (_label, state) => {
    if (state) await setCandidate(state);
    await expect(assignTeamToIncident({ incidentId, teamId, actorUserId: actorId })).rejects.toThrow(/elegível|jornada|disponível/i);
    await expectIncidentUnchanged();
  });

  it("assigns an eligible team and atomically marks its presence busy", async () => {
    const sessionId = await setCandidate("available");
    await expect(assignTeamToIncident({ incidentId, teamId, actorUserId: actorId })).resolves.toMatchObject({ status: "despachada", assignedTeamId: teamId });
    expect(await db.select().from(incidentAssignments).where(eq(incidentAssignments.incidentId, incidentId))).toMatchObject([{ teamId, status: "pendente" }]);
    expect(await db.select().from(operationalPresence).where(eq(operationalPresence.teamId, teamId))).toMatchObject([{ workSessionId: sessionId, status: "busy", availableForDispatch: false }]);
  });

  it("allows only one of two concurrent dispatches for the same team", async () => {
    await setCandidate("available");
    const token = randomUUID().replaceAll("-", "").slice(0, 20);
    const [second] = await db.insert(incidents).values({ code: `r-${token}`, category: "CI", description: "Concurrent eligibility fixture", address: "CI", latitude: "-27.0000000", longitude: "-48.0000000", createdByUserId: actorId }).$returningId();
    incidentIds.push(second.id);

    const results = await Promise.allSettled([
      assignTeamToIncident({ incidentId, teamId, actorUserId: actorId }),
      assignTeamToIncident({ incidentId: second.id, teamId, actorUserId: actorId }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);

    const assignments = await db.select().from(incidentAssignments).where(eq(incidentAssignments.teamId, teamId));
    expect(assignments).toHaveLength(1);
    const persistedIncidents = await db.select().from(incidents).where(eq(incidents.assignedTeamId, teamId));
    expect(persistedIncidents).toHaveLength(1);
    const untouchedId = [incidentId, second.id].find(id => id !== persistedIncidents[0].id)!;
    expect((await db.select().from(incidents).where(eq(incidents.id, untouchedId)))[0]).toMatchObject({ status: "triagem", assignedTeamId: null, dispatchedAt: null });
    expect(await db.select().from(operationalPresence).where(eq(operationalPresence.teamId, teamId))).toMatchObject([{ status: "busy", availableForDispatch: false }]);
  });
});
