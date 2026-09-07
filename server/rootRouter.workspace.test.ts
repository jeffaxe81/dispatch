import { describe, expect, it } from "vitest";
import { rootRouter } from "./rootRouter";

describe("rootRouter workspace integration", () => {
  it("exposes the authenticated workspace procedures through the application root", () => {
    const procedures = Object.keys((rootRouter as any)._def.procedures ?? {});
    expect(procedures).toEqual(expect.arrayContaining([
      "workspace.getOwn",
      "workspace.getOwnScreen",
      "workspace.saveOwn",
      "workspace.resetOwn",
    ]));
  });
});
