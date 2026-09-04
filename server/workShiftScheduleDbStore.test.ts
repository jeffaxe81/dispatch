import { describe, expect, it } from "vitest";
import { createWorkShiftScheduleDbStore } from "./workShiftScheduleDbStore";

describe("work shift schedule db store", () => {
  it("expõe todas as operações exigidas pelo serviço de planejamento", () => {
    const store = createWorkShiftScheduleDbStore({} as never);

    expect(Object.keys(store).sort()).toEqual([
      "findAssignmentById",
      "findAssignmentsForUser",
      "findEffectiveAssignment",
      "findExceptions",
      "findScheduleById",
      "insertAssignment",
      "insertException",
    ]);
  });
});
