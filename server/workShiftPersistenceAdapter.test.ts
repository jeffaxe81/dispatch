import test from "node:test";
import assert from "node:assert/strict";
import { createWorkShiftPersistenceAdapter } from "./workShiftPersistenceAdapter";

test("maps work shift writes to one database transaction", async () => {
  const calls: Array<{ operation: string; value?: unknown }> = [];

  const db = {
    transaction: async (callback: (tx: any) => Promise<unknown>) => {
      calls.push({ operation: "transaction:start" });
      const tx = {
        update: () => ({
          set: (value: unknown) => ({
            where: async () => calls.push({ operation: "session:update", value }),
          }),
        }),
        insert: () => ({
          values: (value: unknown) => {
            calls.push({ operation: "insert", value });
            return {
              $returningId: async () => [{ id: 99 }],
            };
          },
        }),
      };
      const result = await callback(tx);
      calls.push({ operation: "transaction:commit" });
      return result;
    },
  };

  const persistence = createWorkShiftPersistenceAdapter(db as never, 42);
  await persistence.transaction(async tx => {
    const createdId = await tx.createSession({ userId: 7 });
    assert.equal(createdId, 99);

    await tx.updateSession({
      state: "em_jornada",
      startedAt: new Date("2026-09-04T08:00:00.000Z"),
      breakStartedAt: null,
      endedAt: null,
    });
    await tx.insertEvent({
      sessionId: 42,
      userId: 7,
      eventType: "iniciar",
      previousState: "fora_jornada",
      nextState: "em_jornada",
      occurredAt: new Date("2026-09-04T08:00:00.000Z"),
      actorUserId: 7,
      metadata: null,
    });
    await tx.insertAudit({
      resourceType: "work_shift_session",
      resourceId: 42,
      action: "iniciar",
      actorUserId: 7,
      beforeData: { state: "fora_jornada" },
      afterData: { state: "em_jornada" },
    });
  });

  assert.equal(calls[0]?.operation, "transaction:start");
  assert.equal(calls[1]?.operation, "insert");
  assert.equal(calls[2]?.operation, "session:update");
  assert.equal(calls.filter(call => call.operation === "insert").length, 3);
  assert.equal(calls.at(-1)?.operation, "transaction:commit");
});
