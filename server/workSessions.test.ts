import { describe, expect, it } from "vitest";
import { normalizeWorkSessionAdjustmentReason } from "./db";

describe("work session administrative adjustment", () => {
  it("rejects an empty adjustment reason", () => {
    expect(() => normalizeWorkSessionAdjustmentReason("   ")).toThrow("motivo");
  });

  it("normalizes a valid adjustment reason", () => {
    expect(normalizeWorkSessionAdjustmentReason("  Correção autorizada pelo supervisor  ")).toBe(
      "Correção autorizada pelo supervisor",
    );
  });
});
