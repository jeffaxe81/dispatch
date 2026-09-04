import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_WORK_SHIFT_STATES, selectActiveWorkShiftSession, selectWorkShiftHistory } from "./workShiftGateway";

test("active work shift states exclude outside and ended sessions", () => {
  assert.deepEqual(ACTIVE_WORK_SHIFT_STATES, ["em_jornada", "em_intervalo"]);
});

test("returns the most recent active session for a user", async () => {
  const calls: unknown[] = [];
  const expected = {
    id: 42,
    userId: 7,
    state: "em_jornada" as const,
    startedAt: new Date("2026-09-04T08:00:00.000Z"),
    breakStartedAt: null,
    endedAt: null,
  };

  const db = {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          calls.push(condition);
          return {
            orderBy: () => ({
              limit: async (limit: number) => {
                calls.push(limit);
                return [expected];
              },
            }),
          };
        },
      }),
    }),
  };

  const result = await selectActiveWorkShiftSession(db as never, 7);

  assert.equal(calls.at(-1), 1);
  assert.deepEqual(result, expected);
});

test("returns recent work shift sessions only for the authenticated user", async () => {
  const calls: unknown[] = [];
  const expected = [
    {
      id: 44,
      userId: 7,
      state: "encerrada" as const,
      startedAt: new Date("2026-09-03T08:00:00.000Z"),
      breakStartedAt: new Date("2026-09-03T12:00:00.000Z"),
      endedAt: new Date("2026-09-03T17:00:00.000Z"),
    },
  ];

  const db = {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          calls.push(condition);
          return {
            orderBy: () => ({
              limit: async (limit: number) => {
                calls.push(limit);
                return expected;
              },
            }),
          };
        },
      }),
    }),
  };

  const result = await selectWorkShiftHistory(db as never, 7, 10);

  assert.equal(calls.at(-1), 10);
  assert.deepEqual(result, expected);
});
