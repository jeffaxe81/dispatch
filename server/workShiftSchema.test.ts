import test from "node:test";
import assert from "node:assert/strict";
import { getTableColumns } from "drizzle-orm";
import { workShiftEvents, workShiftSessions } from "../drizzle/workShiftSchema";

test("work shift sessions persist user, state and timestamps", () => {
  const columns = getTableColumns(workShiftSessions);

  assert.ok(columns.id);
  assert.ok(columns.userId);
  assert.ok(columns.state);
  assert.equal(columns.state.name, "state");
  assert.ok(columns.startedAt);
  assert.ok(columns.breakStartedAt);
  assert.ok(columns.endedAt);
  assert.ok(columns.createdAt);
  assert.ok(columns.updatedAt);
});

test("work shift events persist immutable transition history", () => {
  const columns = getTableColumns(workShiftEvents);

  assert.ok(columns.id);
  assert.ok(columns.sessionId);
  assert.ok(columns.userId);
  assert.ok(columns.eventType);
  assert.equal(columns.eventType.name, "event_type");
  assert.ok(columns.previousState);
  assert.equal(columns.previousState.name, "previous_state");
  assert.ok(columns.nextState);
  assert.equal(columns.nextState.name, "next_state");
  assert.notEqual(columns.previousState.name, columns.nextState.name);
  assert.ok(columns.occurredAt);
  assert.ok(columns.actorUserId);
  assert.ok(columns.metadata);
  assert.ok(columns.createdAt);
});
