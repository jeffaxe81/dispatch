import test from "node:test";
import assert from "node:assert/strict";
import { runWorkShiftCommand } from "./workShiftRuntime";

test("runs own-user work shift command through gateway and transaction service", async () => {
  const calls: string[] = [];
  const result = await runWorkShiftCommand(
    {
      userId: 7,
      actorUserId: 7,
      command: { type: "iniciar", at: new Date("2026-09-04T08:00:00.000Z") },
    },
    {
      findActiveSession: async userId => {
        calls.push(`find:${userId}`);
        return null;
      },
      executeTransition: async input => {
        calls.push(`execute:${input.userId}:${input.actorUserId}:${input.command.type}`);
        return {
          sessionId: 42,
          snapshot: {
            state: "em_jornada" as const,
            startedAt: input.command.at,
            breakStartedAt: null,
            endedAt: null,
          },
        };
      },
    },
  );

  assert.deepEqual(calls, ["find:7", "execute:7:7:iniciar"]);
  assert.equal(result.sessionId, 42);
  assert.equal(result.snapshot.state, "em_jornada");
});
