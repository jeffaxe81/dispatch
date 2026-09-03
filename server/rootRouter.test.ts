import { describe, expect, it } from "vitest";
import { rootRouter } from "./rootRouter";

describe("rootRouter", () => {
  it("preserva rotas existentes e expõe o namespace CP-016", () => {
    const procedures = Object.keys(rootRouter._def.procedures);

    expect(procedures).toContain("auth.me");
    expect(procedures).toContain("cp016.shift.update");
    expect(procedures).toContain("cp016.embeddedIntegrations.listMine");
    expect(procedures).toContain("cp016.embeddedIntegrations.save");
  });
});
