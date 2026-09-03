import { describe, expect, it } from "vitest";
import {
  SHIFT_TEMPLATE_KINDS,
  WORK_SESSION_STATUSES,
  OPERATIONAL_PRESENCE_STATUSES,
  type ShiftTemplateKind,
  type WorkSessionStatus,
  type OperationalPresenceStatus,
} from "./operations";

describe("CP-016 operational contracts", () => {
  it("declares the supported shift template kinds", () => {
    expect(SHIFT_TEMPLATE_KINDS).toEqual(["fixed", "12x36", "custom"]);
    // Compile-time assignment also proves the readonly-array union is exported.
    const kind: ShiftTemplateKind = "12x36";
    expect(kind).toBe("12x36");
  });

  it("declares work-session lifecycle statuses", () => {
    expect(WORK_SESSION_STATUSES).toEqual(["open", "paused", "closed", "adjusted"]);
    const status: WorkSessionStatus = "paused";
    expect(status).toBe("paused");
  });

  it("declares dispatch presence statuses", () => {
    expect(OPERATIONAL_PRESENCE_STATUSES).toEqual([
      "available",
      "busy",
      "paused",
      "offline",
      "out_of_shift",
    ]);
    const presence: OperationalPresenceStatus = "out_of_shift";
    expect(presence).toBe("out_of_shift");
  });
});
