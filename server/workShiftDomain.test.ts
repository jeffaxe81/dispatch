import test from "node:test";
import assert from "node:assert/strict";
import { transitionWorkShift } from "./workShiftDomain";

test("starts a work shift from outside jornada", () => {
  const result = transitionWorkShift(
    { state: "fora_jornada", startedAt: null, breakStartedAt: null, endedAt: null },
    { type: "iniciar", at: new Date("2026-09-04T08:00:00.000Z") },
  );

  assert.deepEqual(result, {
    state: "em_jornada",
    startedAt: new Date("2026-09-04T08:00:00.000Z"),
    breakStartedAt: null,
    endedAt: null,
  });
});
