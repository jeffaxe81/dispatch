import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_PRESENCE_STATUSES,
  SHIFT_TEMPLATE_KINDS,
  WORK_SESSION_STATUSES,
} from "./operations";

describe("CP-016 operational contracts", () => {
  it("declares the supported shift template kinds", () => {
    expect(SHIFT_TEMPLATE_KINDS).toEqual(["fixed", "12x36", "custom"]);
  });

  it("declares work-session lifecycle statuses", () => {
    expect(WORK_SESSION_STATUSES).toEqual(["open", "paused", "closed", "adjusted"]);
  });

  it("declares dispatch presence statuses", () => {
    expect(OPERATIONAL_PRESENCE_STATUSES).toEqual([
      "available",
      "busy",
      "paused",
      "offline",
      "out_of_shift",
    ]);
  });
});
