import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertSuperAdministrator: vi.fn(),
  listEvidenceReconciliationCandidates: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertSuperAdministrator: mocks.assertSuperAdministrator,
}));
vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  listEvidenceReconciliationCandidates: mocks.listEvidenceReconciliationCandidates,
}));

import { appRouter } from "./routers";

function actor(): TrpcContext {
  return {
    user: {
      id: 91, openId: "reconciliation-admin", role: "admin",
      operationalRole: "administrador", teamId: null, active: true,
      loginMethod: "test", name: "Reconciliation", email: null,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Super Administrator evidence recovery listing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertSuperAdministrator.mockResolvedValue(undefined);
    mocks.listEvidenceReconciliationCandidates.mockResolvedValue({
      rows: [{
        attemptId: "06c24ffc-b9e8-4189-a44a-1f29469a6a65",
        incidentId: 33, actorUserId: 91, teamId: 1,
        state: "cleanup_required", hasEvidenceReference: false,
        incidentExists: false, reason: "cleanup_pending_review",
      }],
      total: 1, page: 1, pageSize: 25, staleAfterMinutes: 15,
    });
  });

  it("enforces Super Administrator access before a bounded read-only query", async () => {
    const result = await appRouter.createCaller(actor()).settings.evidenceRecovery({});
    expect(mocks.assertSuperAdministrator).toHaveBeenCalledTimes(1);
    expect(mocks.listEvidenceReconciliationCandidates).toHaveBeenCalledWith({
      page: 1, pageSize: 25,
    });
    expect(result.total).toBe(1);
    expect(result.rows[0]).not.toHaveProperty("storageKey");
  });

  it("denies access when Super Administrator check fails, without querying data", async () => {
    mocks.assertSuperAdministrator.mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN", message: "Super Administrator required" }),
    );
    await expect(appRouter.createCaller(actor()).settings.evidenceRecovery({}))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listEvidenceReconciliationCandidates).not.toHaveBeenCalled();
  });

  it("rejects unbounded pages before reading the database", async () => {
    await expect(appRouter.createCaller(actor()).settings.evidenceRecovery({
      page: 1, pageSize: 101,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.listEvidenceReconciliationCandidates).not.toHaveBeenCalled();
  });
});
