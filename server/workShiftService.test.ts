import test from "node:test";
import assert from "node:assert/strict";
import { executeWorkShiftTransition } from "./workShiftService";

test("persists session, event and audit inside one transaction", async () => {
  const calls: string[] = [];
  const startedAt = new Date("2026-09-04T08:00:00.000Z");

  const result = await executeWorkShiftTransition(
    {
      sessionId: 42,
      userId: 7,
      actorUserId: 7,
      current: {
        state: "fora_jornada",
        startedAt: null,
        breakStartedAt: null,
        endedAt: null,
      },
      command: { type: "iniciar", at: startedAt },
    },
    {
      transaction: async callback => {
        calls.push("transaction:start");
        const value = await callback({
          createSession: async () => 42,
          updateSession: async () => calls.push("session:update"),
          insertEvent: async () => calls.push("event:insert"),
          insertAudit: async () => calls.push("audit:insert"),
        });
        calls.push("transaction:commit");
        return value;
      },
    },
  );

  assert.deepEqual(calls, [
    "transaction:start",
    "session:update",
    "event:insert",
    "audit:insert",
    "transaction:commit",
  ]);
  assert.equal(result.sessionId, 42);
  assert.equal(result.snapshot.state, "em_jornada");
  assert.equal(result.snapshot.startedAt?.toISOString(), startedAt.toISOString());
});

test("creates the first session inside the same transaction", async () => {
  const calls: string[] = [];
  const startedAt = new Date("2026-09-04T08:00:00.000Z");

  const result = await executeWorkShiftTransition(
    {
      sessionId: null,
      userId: 7,
      actorUserId: 7,
      current: {
        state: "fora_jornada",
        startedAt: null,
        breakStartedAt: null,
        endedAt: null,
      },
      command: { type: "iniciar", at: startedAt },
    },
    {
      transaction: async callback => {
        calls.push("transaction:start");
        const value = await callback({
          createSession: async () => {
            calls.push("session:create");
            return 99;
          },
          updateSession: async () => calls.push("session:update"),
          insertEvent: async () => calls.push("event:insert"),
          insertAudit: async () => calls.push("audit:insert"),
        });
        calls.push("transaction:commit");
        return value;
      },
    },
  );

  assert.deepEqual(calls, [
    "transaction:start",
    "session:create",
    "session:update",
    "event:insert",
    "audit:insert",
    "transaction:commit",
  ]);
  assert.equal(result.sessionId, 99);
  assert.equal(result.snapshot.state, "em_jornada");
});
