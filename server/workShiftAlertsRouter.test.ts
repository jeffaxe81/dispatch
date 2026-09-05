import { describe, expect, it } from "vitest";
import { createWorkShiftAlertsRouter } from "./workShiftAlertsRouter";

const deps = {
  resolveActor: async () => ({
    userId: 1,
    organizationId: null,
    organizationalUnitId: null,
    permissions: ["*"],
  }),
  list: async () => [],
  evaluate: async () => [],
  acknowledge: async () => null,
  resolve: async () => null,
};

describe("D-007D3 work shift alerts router", () => {
  it("expõe consulta, avaliação e transições previstas", () => {
    const router = createWorkShiftAlertsRouter(deps as never);
    expect(Object.keys((router as any)._def.procedures).sort()).toEqual([
      "acknowledge",
      "evaluate",
      "list",
      "resolve",
    ]);
  });
});
