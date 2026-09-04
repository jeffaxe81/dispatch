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

function context(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "jornada-agent-errors",
      name: "Agente Jornada",
      email: "agente@test.local",
      loginMethod: "test",
      role: "user",
      operationalRole: "agente",
      teamId: 3,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("work shift router error contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps invalid domain transitions to BAD_REQUEST without exposing the internal transition", async () => {
    mocks.runDatabaseWorkShiftCommand.mockRejectedValue(
      new Error("transicao_invalida:em_intervalo->iniciar_intervalo"),
    );

    const caller = workShiftRouter.createCaller(context());

    await expect(caller.break()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Transição de jornada inválida.",
    });
  });

  it("maps missing active shift to BAD_REQUEST", async () => {
    mocks.runDatabaseWorkShiftCommand.mockRejectedValue(
      new Error("jornada_ativa_nao_encontrada"),
    );

    const caller = workShiftRouter.createCaller(context());

    await expect(caller.resume()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Jornada ativa não encontrada.",
    });
  });
});
