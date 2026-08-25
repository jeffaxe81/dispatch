import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  allowed: true,
  assertSuperAdministrator: vi.fn(),
  getSolutionResetPreview: vi.fn(),
  resetSolutionOperationalData: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertSuperAdministrator: mocks.assertSuperAdministrator,
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getSolutionResetPreview: mocks.getSolutionResetPreview,
  resetSolutionOperationalData: mocks.resetSolutionOperationalData,
}));

import { isSolutionResetConfirmationValid, SOLUTION_RESET_CONFIRMATIONS } from "./db";
import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: {
      id: 45,
      openId: "super-admin-test",
      name: "Super Administrador de Teste",
      email: "super@example.invalid",
      loginMethod: "test",
      role: "admin",
      operationalRole: "administrador",
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

describe("reinicialização controlada da solução", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allowed = true;
    mocks.assertSuperAdministrator.mockImplementation(async () => {
      if (!mocks.allowed) throw new TRPCError({ code: "FORBIDDEN" });
    });
    mocks.getSolutionResetPreview.mockResolvedValue({ impact: { occurrences: 2, workflows: 1 }, totalRecords: 3, preserved: ["usuários"], evidenceStorageNote: "Referências removidas." });
    mocks.resetSolutionOperationalData.mockResolvedValue({ impact: { occurrences: 2, workflows: 1 }, totalRecords: 3, completedAt: "2026-08-21T00:00:00.000Z", auditPreserved: true });
  });

  it("aceita somente a confirmação textual exata, sem variar o requisito de segurança", () => {
    expect(isSolutionResetConfirmationValid("operational", SOLUTION_RESET_CONFIRMATIONS.operational)).toBe(true);
    expect(isSolutionResetConfirmationValid("total", `  ${SOLUTION_RESET_CONFIRMATIONS.total.toLowerCase()}  `)).toBe(true);
    expect(isSolutionResetConfirmationValid("operational", "ZERAR AXE")).toBe(false);
    expect(isSolutionResetConfirmationValid("total", "EXCLUIR AXE DISPATCH")).toBe(false);
  });

  it("expõe a prévia e executa a reinicialização somente sob autorização de Super Administrador", async () => {
    const caller = appRouter.createCaller(context());
    const preview = await caller.settings.resetPreview({ scope: "operational" });
    const result = await caller.settings.resetOperationalData({ scope: "operational", confirmation: SOLUTION_RESET_CONFIRMATIONS.operational, reason: "Preparar o ambiente para novo ciclo controlado." });

    expect(preview.totalRecords).toBe(3);
    expect(result.auditPreserved).toBe(true);
    expect(mocks.assertSuperAdministrator).toHaveBeenCalledTimes(2);
    expect(mocks.resetSolutionOperationalData).toHaveBeenCalledWith({ actorUserId: 45, scope: "operational", confirmation: SOLUTION_RESET_CONFIRMATIONS.operational, reason: "Preparar o ambiente para novo ciclo controlado." });
  });

  it("bloqueia prévia e reinicialização quando a validação de Super Administrador falha", async () => {
    mocks.allowed = false;
    const caller = appRouter.createCaller(context());

    await expect(caller.settings.resetPreview({ scope: "total" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.settings.resetOperationalData({ scope: "total", confirmation: SOLUTION_RESET_CONFIRMATIONS.total, reason: "Tentativa sem privilégio suficiente." })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getSolutionResetPreview).not.toHaveBeenCalled();
    expect(mocks.resetSolutionOperationalData).not.toHaveBeenCalled();
  });
});
