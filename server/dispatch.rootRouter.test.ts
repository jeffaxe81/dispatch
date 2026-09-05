import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { rootRouter } from "./rootRouter";

function context(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "dispatcher",
      name: "Despachador",
      email: "dispatcher@test.local",
      loginMethod: "test",
      role: "user",
      operationalRole: "despachador",
      teamId: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("application root router with D-007C", () => {
  it("expõe dispatch.rankEligibleCandidates sem remover GIS e jornadas existentes", () => {
    const caller = rootRouter.createCaller(context()) as ReturnType<typeof rootRouter.createCaller> & {
      dispatch?: { rankEligibleCandidates?: unknown };
    };

    expect(caller.dispatch).toBeDefined();
    expect(caller.dispatch?.rankEligibleCandidates).toBeDefined();
    expect(caller.gis).toBeDefined();
    expect(caller.workShifts).toBeDefined();
    expect(caller.workShiftSchedules).toBeDefined();
  });
});
