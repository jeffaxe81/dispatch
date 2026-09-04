import { describe, expect, it } from "vitest";
import { rootRouter } from "./rootRouter";

describe("root router composition", () => {
  it("preserves existing routes and adds work shift routes", () => {
    const record = rootRouter._def.record as Record<string, unknown>;

    expect(record.auth).toBeDefined();
    expect(record.incidents).toBeDefined();
    expect(record.teams).toBeDefined();
    expect(record.workShift).toBeDefined();
  });
});
