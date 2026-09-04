import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkShiftPersistencePlan } from "./workShiftPersistencePlan";

test("builds session event and audit writes for starting a work shift", () => {
  const startedAt = new Date("2026-09-04T08:00:00.000Z");
  const plan = buildWorkShiftPersistencePlan({
    sessionId: 42,
    userId: 7,
    actorUserId: 7,
    previous: {
      state: "fora_jornada",
      startedAt: null,
      breakStartedAt: null,
      endedAt: null,
    },
    next: {
      state: "em_jornada",
      startedAt,
      breakStartedAt: null,
      endedAt: null,
    },
    command: { type: "iniciar", at: startedAt },
  });

  assert.deepEqual(plan.sessionPatch, {
    state: "em_jornada",
    startedAt,
    breakStartedAt: null,
    endedAt: null,
  });
  assert.deepEqual(plan.event, {
    sessionId: 42,
    userId: 7,
    eventType: "iniciar",
    previousState: "fora_jornada",
    nextState: "em_jornada",
    occurredAt: startedAt,
    actorUserId: 7,
    metadata: null,
  });
  assert.deepEqual(plan.audit, {
    resourceType: "work_shift_session",
    resourceId: 42,
    action: "iniciar",
    actorUserId: 7,
    beforeData: {
      state: "fora_jornada",
      startedAt: null,
      breakStartedAt: null,
      endedAt: null,
    },
    afterData: {
      state: "em_jornada",
      startedAt: startedAt.toISOString(),
      breakStartedAt: null,
      endedAt: null,
    },
  });
});
