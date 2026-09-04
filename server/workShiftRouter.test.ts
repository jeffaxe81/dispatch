import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  runDatabaseWorkShiftCommand: vi.fn(),
  getDatabaseWorkShiftStatus: vi.fn(),
}));

vi.mock("./workShiftRuntime", () => ({
  runDatabaseWorkShiftCommand: mocks.runDatabaseWorkShiftCommand,
  getDatabaseWorkShiftStatus: mocks.getDatabaseWorkShiftStatus,
}));

import { workShiftRouter } from "./workShiftRouter";

function context(active = true): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "jornada-agent",
      name: "Agente Jornada",
      email: "agente@test.local",
      loginMethod: "test",
      role: "user",
      operationalRole: "agente",
      teamId: 3,
      active,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("work shift router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runDatabaseWorkShiftCommand.mockResolvedValue({
      sessionId: 42,
      snapshot: { state: "em_jornada", startedAt: new Date(), breakStartedAt: null, endedAt: null },
    });
    mocks.getDatabaseWorkShiftStatus.mockResolvedValue(null);
  });

  it("uses the authenticated user as both subject and actor", async () => {
    const caller = workShiftRouter.createCaller(context());

    await caller.start();

    expect(mocks.runDatabaseWorkShiftCommand).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, actorUserId: 7, command: expect.objectContaining({ type: "iniciar" }) }),
    );
  });

  it("exposes current status only for the authenticated user", async () => {
    const caller = workShiftRouter.createCaller(context());

    await caller.current();

    expect(mocks.getDatabaseWorkShiftStatus).toHaveBeenCalledWith(7);
  });

  it("rejects an inactive operational user", async () => {
    const caller = workShiftRouter.createCaller(context(false));

    await expect(caller.start()).rejects.toThrow("Usuário operacional inativo.");
    expect(mocks.runDatabaseWorkShiftCommand).not.toHaveBeenCalled();
  });
});
