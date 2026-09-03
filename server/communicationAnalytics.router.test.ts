import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  assertTeamScope: vi.fn(),
  getCommunicationAnalytics: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
  assertTeamScope: mocks.assertTeamScope,
  resolveAuthorizedTeamFilter: async (user: unknown, teamId: number | undefined, permission: string) => {
    await mocks.assertPermission(user, permission);
    if (teamId) await mocks.assertTeamScope(user, teamId, permission);
    return teamId;
  },
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getCommunicationAnalytics: mocks.getCommunicationAnalytics,
}));

import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: { id: 71, openId: "communication-analytics-test", name: "Analytics", email: "analytics@example.invalid", loginMethod: "test", role: "admin", operationalRole: "despachador", teamId: null, active: true, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("communications analytics router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.assertTeamScope.mockResolvedValue(undefined);
    mocks.getCommunicationAnalytics.mockResolvedValue({ totalSessions: 2, completedSessions: 1, failedSessions: 1, activeSessions: 0, totalDurationSeconds: 120, averageDurationSeconds: 120, byChannel: { nao_informado: 0, voz: 2, chat: 0, whatsapp: 0, email: 0, video: 0, outro: 0 } });
  });

  it("applies report scope and communication permission before returning consolidated metrics", async () => {
    const caller = appRouter.createCaller(context());
    const result = await caller.communications.analytics({
      startDate: new Date("2026-09-01T00:00:00Z"),
      endDate: new Date("2026-09-03T23:59:59Z"),
      teamId: 8,
      channel: "voz",
      status: "encerrada",
    });

    expect(result.totalSessions).toBe(2);
    expect(mocks.assertPermission).toHaveBeenCalledWith(expect.anything(), "integrations.view");
    expect(mocks.assertPermission).toHaveBeenCalledWith(expect.anything(), "reports.view");
    expect(mocks.assertTeamScope).toHaveBeenCalledWith(expect.anything(), 8, "reports.view");
    expect(mocks.getCommunicationAnalytics).toHaveBeenCalledWith(expect.objectContaining({ teamId: 8, channel: "voz", status: "encerrada" }));
  });
});
