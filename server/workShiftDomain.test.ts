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

test("starts a break from an active work shift", () => {
  const startedAt = new Date("2026-09-04T08:00:00.000Z");
  const breakStartedAt = new Date("2026-09-04T12:00:00.000Z");

  const result = transitionWorkShift(
    { state: "em_jornada", startedAt, breakStartedAt: null, endedAt: null },
    { type: "iniciar_intervalo", at: breakStartedAt },
  );

  assert.deepEqual(result, {
    state: "em_intervalo",
    startedAt,
    breakStartedAt,
    endedAt: null,
  });
});

test("resumes a work shift from break", () => {
  const startedAt = new Date("2026-09-04T08:00:00.000Z");

  const result = transitionWorkShift(
    {
      state: "em_intervalo",
      startedAt,
      breakStartedAt: new Date("2026-09-04T12:00:00.000Z"),
      endedAt: null,
    },
    { type: "retomar", at: new Date("2026-09-04T13:00:00.000Z") },
  );

  assert.deepEqual(result, {
    state: "em_jornada",
    startedAt,
    breakStartedAt: null,
    endedAt: null,
  });
});

test("ends an active work shift", () => {
  const startedAt = new Date("2026-09-04T08:00:00.000Z");
  const endedAt = new Date("2026-09-04T17:00:00.000Z");

  const result = transitionWorkShift(
    { state: "em_jornada", startedAt, breakStartedAt: null, endedAt: null },
    { type: "encerrar", at: endedAt },
  );

  assert.deepEqual(result, {
    state: "encerrada",
    startedAt,
    breakStartedAt: null,
    endedAt,
  });
});
