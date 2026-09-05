import { describe, expect, it } from "vitest";
import { createWorkShiftAdjustmentsRouter } from "./workShiftAdjustmentsRouter";

const deps = {
  resolveActor: async () => ({ userId: 1, organizationId: 1, organizationalUnitIds: [] }),
  list: async () => [],
  request: async () => ({ id: 1 }),
  approve: async () => ({ id: 1, status: "approved" }),
  reject: async () => ({ id: 1, status: "rejected" }),
};

describe("D-007D1 work shift adjustments router", () => {
  it("expõe os quatro contratos previstos", () => {
    const router = createWorkShiftAdjustmentsRouter(deps as never);
    const procedures = Object.keys((router as any)._def.procedures).sort();

    expect(procedures).toEqual(["approve", "list", "reject", "request"]);
  });
});
