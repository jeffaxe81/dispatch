import test from "node:test";
import assert from "node:assert/strict";
import { handleWorkShiftCommand } from "./workShiftApplicationService";

test("starts a new work shift when user has no active session", async () => {
  const startedAt = new Date("2026-09-04T08:00:00.000Z");
  const calls: string[] = [];

  const result = await handleWorkShiftCommand(
    { userId: 7, actorUserId: 7, command: { type: "iniciar", at: startedAt } },
    {
      findActiveSession: async () => null,
      executeTransition: async input => {
        calls.push(`transition:${input.sessionId ?? "new"}:${input.current.state}`);
        return {
          sessionId: 99,
          snapshot: {
            state: "em_jornada" as const,
            startedAt,
            breakStartedAt: null,
            endedAt: null,
          },
        };
      },
    },
  );

  assert.deepEqual(calls, ["transition:new:fora_jornada"]);
  assert.equal(result.sessionId, 99);
  assert.equal(result.snapshot.state, "em_jornada");
});

test("rejects non-start commands when user has no active session", async () => {
  await assert.rejects(
    () =>
      handleWorkShiftCommand(
        {
          userId: 7,
          actorUserId: 7,
          command: { type: "iniciar_intervalo", at: new Date("2026-09-04T12:00:00.000Z") },
        },
        {
          findActiveSession: async () => null,
          executeTransition: async () => {
            throw new Error("não deveria executar");
          },
        },
      ),
    /jornada_ativa_nao_encontrada/,
  );
});
