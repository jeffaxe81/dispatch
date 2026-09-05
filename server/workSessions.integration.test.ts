import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { auditLogs, teams, users } from "../drizzle/schema";
import { operationalPresence, workSessionEvents, workSessions } from "../drizzle/cp016Schema";
import { adjustWorkSession, setDbForTesting, updateTeamShift } from "./db";

describe("CP-016 administrative adjustment on disposable MySQL", () => {
  let pool: mysql.Pool | undefined;
  let db: ReturnType<typeof drizzle>;
  let actorId: number;
  let sessionId: number | undefined;
  const startedAt = new Date("2026-09-05T08:00:00Z");
  const correctedAt = new Date("2026-09-05T09:00:00Z");
  const triggerName = `cp016_audit_${randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (process.env.CP016_DISPOSABLE_DB !== "1" || url.hostname !== "127.0.0.1" || url.pathname !== "/dispatch_cp016_ci") {
      throw new Error("CP-016 integration tests require the explicitly disposable local CI database.");
    }
    pool = mysql.createPool({ uri: url.toString(), timezone: "Z", connectionLimit: 4 });
    db = drizzle(pool);
    setDbForTesting(db);
    const [actor] = await db.insert(users).values({ openId: `cp016:${randomUUID()}`, name: "CP016 test actor" }).$returningId();
    actorId = actor.id;
  });

  beforeEach(async () => {
    const [session] = await db.insert(workSessions).values({ userId: actorId, startedAt }).$returningId();
    sessionId = session.id;
  });

  const readSession = async () => (await db.select().from(workSessions).where(eq(workSessions.id, sessionId!)))[0];
  const readEvents = () => db.select().from(workSessionEvents).where(eq(workSessionEvents.workSessionId, sessionId!));
  const readAudits = () => db.select().from(auditLogs).where(and(eq(auditLogs.resourceType, "work_session"), eq(auditLogs.resourceId, sessionId!)));

  afterEach(async () => {
    if (!sessionId) return;
    await db.delete(auditLogs).where(and(eq(auditLogs.resourceType, "work_session"), eq(auditLogs.resourceId, sessionId)));
    await db.delete(workSessions).where(eq(workSessions.id, sessionId));
    sessionId = undefined;
  });

  afterAll(async () => {
    try {
      if (actorId) await db.delete(users).where(eq(users.id, actorId));
    } finally {
      setDbForTesting(null);
      await pool?.end();
    }
  });

  it("persists the corrected session with its event and before/after audit", async () => {
    await adjustWorkSession({ workSessionId: sessionId!, actorUserId: actorId, reason: "  Correção autorizada  ", startedAt: correctedAt, totalPauseSeconds: 120 });
    expect(await readSession()).toMatchObject({ startedAt: correctedAt, totalPauseSeconds: 120, source: "admin_adjustment" });
    expect(await readEvents()).toMatchObject([{ eventType: "adjustment", actorUserId: actorId, reason: "Correção autorizada" }]);
    expect(await readAudits()).toMatchObject([{
      action: "admin_adjustment", actorUserId: actorId,
      beforeData: { startedAt: "2026-09-05T08:00:00.000Z", totalPauseSeconds: 0, source: "manual" },
      afterData: { startedAt: "2026-09-05T09:00:00.000Z", totalPauseSeconds: 120, source: "admin_adjustment", reason: "Correção autorizada" },
    }]);
  });

  it("rejects a blank reason without changing persisted data", async () => {
    await expect(adjustWorkSession({ workSessionId: sessionId!, actorUserId: actorId, reason: "  ", startedAt: correctedAt })).rejects.toThrow(/motivo/i);
    expect(await readSession()).toMatchObject({ startedAt, source: "manual", totalPauseSeconds: 0 });
    expect(await readEvents()).toEqual([]);
    expect(await readAudits()).toEqual([]);
  });

  it("rolls back the session and event when the audit insert fails", async () => {
    // The real database rejects only this fixture actor's audit, after the event insert.
    // Root is used only for test-trigger DDL: MySQL binary logging can require SUPER.
    if (!process.env.CP016_TEST_ROOT_PASSWORD) throw new Error("Disposable trigger administrator is required.");
    const url = new URL(process.env.DATABASE_URL!);
    const admin = await mysql.createConnection({ host: "127.0.0.1", port: Number(url.port || 3306), user: "root", password: process.env.CP016_TEST_ROOT_PASSWORD, database: "dispatch_cp016_ci" });
    let triggerCreated = false;
    try {
      await admin.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN IF NEW.actor_user_id = ${actorId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CP016 injected audit failure'; END IF; END`);
      triggerCreated = true;
      await expect(adjustWorkSession({ workSessionId: sessionId!, actorUserId: actorId, reason: "Correção autorizada", startedAt: correctedAt, totalPauseSeconds: 120 })).rejects.toThrow();
      expect(await readSession()).toMatchObject({ startedAt, source: "manual", totalPauseSeconds: 0 });
      expect(await readEvents()).toEqual([]);
      expect(await readAudits()).toEqual([]);
    } finally {
      try {
        if (triggerCreated) await admin.query(`DROP TRIGGER ${triggerName}`);
      } finally {
        await admin.end();
      }
    }
  });
});

describe("CP-016 team shift lifecycle on disposable MySQL", () => {
  let pool: mysql.Pool | undefined;
  let db: ReturnType<typeof drizzle>;
  let actorId: number;
  let teamId: number | undefined;
  const at = (time: string) => new Date(`2026-09-05T${time}:00.000Z`);

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (process.env.CP016_DISPOSABLE_DB !== "1" || url.hostname !== "127.0.0.1" || url.pathname !== "/dispatch_cp016_ci") {
      throw new Error("CP-016 lifecycle tests require the explicitly disposable local CI database.");
    }
    pool = mysql.createPool({ uri: url.toString(), timezone: "Z", connectionLimit: 4 });
    db = drizzle(pool);
    setDbForTesting(db);
    const [actor] = await db.insert(users).values({ openId: `shift:${randomUUID()}`, name: "Shift test actor" }).$returningId();
    actorId = actor.id;
  });

  beforeEach(async () => {
    const [team] = await db.insert(teams).values({ code: `ci-${randomUUID().slice(0, 24)}`, name: "Disposable shift team", agency: "CI" }).$returningId();
    teamId = team.id;
    // Only Date is controlled; MySQL networking and timeout timers stay real.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at("08:00"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (!teamId) return;
    await db.delete(operationalPresence).where(eq(operationalPresence.teamId, teamId));
    await db.delete(workSessions).where(eq(workSessions.teamId, teamId));
    await db.delete(auditLogs).where(and(eq(auditLogs.resourceType, "team"), eq(auditLogs.resourceId, teamId)));
    await db.delete(teams).where(eq(teams.id, teamId));
    teamId = undefined;
  });

  afterAll(async () => {
    try {
      if (actorId) await db.delete(users).where(eq(users.id, actorId));
    } finally {
      setDbForTesting(null);
      await pool?.end();
    }
  });

  const act = async (action: "start" | "pause" | "resume" | "end", time: string) => {
    vi.setSystemTime(at(time));
    await updateTeamShift({ teamId: teamId!, actorUserId: actorId, action });
  };
  const snapshot = async () => ({
    team: (await db.select().from(teams).where(eq(teams.id, teamId!)))[0],
    sessions: await db.select().from(workSessions).where(eq(workSessions.teamId, teamId!)),
    presence: await db.select().from(operationalPresence).where(eq(operationalPresence.teamId, teamId!)),
    audits: await db.select().from(auditLogs).where(and(eq(auditLogs.resourceType, "team"), eq(auditLogs.resourceId, teamId!))).orderBy(auditLogs.id),
  });

  it("persists all four transitions and synchronizes presence with the same session", async () => {
    await act("start", "08:00");
    const start = await snapshot();
    expect(start.team).toMatchObject({ shiftStartedAt: at("08:00"), shiftPausedAt: null, shiftEndsAt: null });
    expect(start.sessions).toMatchObject([{ status: "open", userId: actorId, totalPauseSeconds: 0 }]);
    const sessionId = start.sessions[0].id;
    expect(start.presence).toMatchObject([{ workSessionId: sessionId, status: "available", availableForDispatch: true }]);

    await act("pause", "10:00");
    const pause = await snapshot();
    expect(pause.team.shiftPausedAt).toEqual(at("10:00"));
    expect(pause.sessions).toMatchObject([{ id: sessionId, status: "paused" }]);
    expect(pause.presence).toMatchObject([{ workSessionId: sessionId, status: "paused", availableForDispatch: false }]);

    await act("resume", "10:15");
    const resume = await snapshot();
    expect(resume.team).toMatchObject({ shiftPausedAt: null, shiftPausedTotalSeconds: 900 });
    expect(resume.sessions).toMatchObject([{ id: sessionId, status: "open", totalPauseSeconds: 900 }]);
    expect(resume.presence).toMatchObject([{ workSessionId: sessionId, status: "available", availableForDispatch: true }]);

    await act("end", "12:00");
    const end = await snapshot();
    expect(end.team).toMatchObject({ shiftEndsAt: at("12:00"), shiftPausedAt: null, shiftPausedTotalSeconds: 900 });
    expect(end.sessions).toMatchObject([{ id: sessionId, status: "closed", endedAt: at("12:00"), totalPauseSeconds: 900 }]);
    expect(end.presence).toMatchObject([{ workSessionId: sessionId, status: "out_of_shift", availableForDispatch: false }]);
    const events = await db.select().from(workSessionEvents).where(eq(workSessionEvents.workSessionId, sessionId)).orderBy(workSessionEvents.id);
    expect(events.map(event => ({ type: event.eventType, at: event.occurredAt, actor: event.actorUserId }))).toEqual([
      { type: "start", at: at("08:00"), actor: actorId },
      { type: "pause", at: at("10:00"), actor: actorId },
      { type: "resume", at: at("10:15"), actor: actorId },
      { type: "end", at: at("12:00"), actor: actorId },
    ]);
    expect(end.audits.map(audit => audit.action)).toEqual(["shift_started", "shift_paused", "shift_resumed", "shift_ended"]);
  });

  it("includes an ongoing pause when ending the shift", async () => {
    await act("start", "08:00");
    await act("pause", "10:00");
    await act("end", "10:20");
    const end = await snapshot();
    expect(end.team).toMatchObject({ shiftPausedAt: null, shiftPausedTotalSeconds: 1200, shiftEndsAt: at("10:20") });
    expect(end.sessions).toMatchObject([{ status: "closed", totalPauseSeconds: 1200, endedAt: at("10:20") }]);
    expect(end.presence).toMatchObject([{ status: "out_of_shift", availableForDispatch: false }]);
  });

  it("rejects invalid transitions without adding sessions or history", async () => {
    const initial = await snapshot();
    await expect(act("pause", "08:00")).rejects.toThrow(/Inicie a jornada/);
    expect(await snapshot()).toEqual(initial);
    await act("start", "08:00");
    const started = await snapshot();
    await expect(act("start", "08:01")).rejects.toThrow(/andamento/);
    await expect(act("resume", "08:02")).rejects.toThrow(/pausa/);
    expect(await snapshot()).toEqual(started);
    const events = await db.select().from(workSessionEvents).where(eq(workSessionEvents.workSessionId, started.sessions[0].id));
    expect(events.map(event => event.eventType)).toEqual(["start"]);
  });
});
