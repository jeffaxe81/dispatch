import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  resolveAuthorizedTeamFilter: vi.fn(),
  listIncidents: vi.fn(),
}));
vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  resolveAuthorizedTeamFilter: mocks.resolveAuthorizedTeamFilter,
}));
vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  listIncidents: mocks.listIncidents,
}));

import { appRouter } from "./routers";

function ctx(role: "operador" | "agente" = "operador", teamId: number | null = null): TrpcContext {
  return {
    user: {
      id: 94,
      openId: "qa-incident-filter",
      role: "user",
      operationalRole: role,
      teamId,
      active: true,
      name: "Conta de teste",
      email: "qa-incident-filter@example.invalid",
    } as TrpcContext["user"],
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("P0 R011 — authorized incident list filters are enforced before DB read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthorizedTeamFilter.mockResolvedValue(7);
    mocks.listIncidents.mockResolvedValue({ rows: [], total: 0 });
  });

  it("does not list any incidents if dynamic team selection is omitted", async () => {
    mocks.resolveAuthorizedTeamFilter.mockRejectedValueOnce(
      new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma equipe autorizada." }),
    );
    await expect(appRouter.createCaller(ctx()).incidents.list({ page: 1, pageSize: 25 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.resolveAuthorizedTeamFilter).toHaveBeenCalledWith(
      expect.objectContaining({ id: 94 }), undefined, "occurrences.view",
    );
    expect(mocks.listIncidents).not.toHaveBeenCalled();
  });

  it("applies the exact authorized team before pagination", async () => {
    await appRouter.createCaller(ctx()).incidents.list({
      page: 3, pageSize: 25, teamId: 7, status: "triagem",
    });
    expect(mocks.resolveAuthorizedTeamFilter).toHaveBeenCalledWith(
      expect.objectContaining({ id: 94 }), 7, "occurrences.view",
    );
    expect(mocks.listIncidents).toHaveBeenCalledWith(expect.objectContaining({
      page: 3, pageSize: 25, teamId: 7, status: "triagem",
    }));
  });

  it("rejects a requested team outside the authorized scope", async () => {
    mocks.resolveAuthorizedTeamFilter.mockRejectedValueOnce(
      new TRPCError({ code: "FORBIDDEN", message: "Equipe fora de escopo." }),
    );
    await expect(appRouter.createCaller(ctx()).incidents.list({
      page: 1, pageSize: 25, teamId: 999,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listIncidents).not.toHaveBeenCalled();
  });

  it("preserves the authorized field team's identity instead of widening to all", async () => {
    mocks.resolveAuthorizedTeamFilter.mockResolvedValueOnce(3);
    await appRouter.createCaller(ctx("agente", 3)).incidents.list({
      page: 1, pageSize: 10,
    });
    expect(mocks.listIncidents).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 3, pageSize: 10,
    }));
  });

  it("does not discard an explicit allowed date filter", async () => {
    const from = new Date("2026-10-01T00:00:00.000Z");
    const before = new Date("2026-11-01T00:00:00.000Z");
    await appRouter.createCaller(ctx()).incidents.list({
      page: 1, pageSize: 20, openedFrom: from, openedBefore: before,
    });
    expect(mocks.listIncidents).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 7, openedFrom: from, openedBefore: before,
    }));
  });
});
