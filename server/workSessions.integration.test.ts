import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { auditLogs, users } from "../drizzle/schema";
import { workSessionEvents, workSessions } from "../drizzle/cp016Schema";
import { adjustWorkSession, setDbForTesting } from "./db";

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
