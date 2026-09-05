import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(async () => ({ kind: "db" })),
  loadCoverage: vi.fn(async () => ({ assignments: [], exceptions: [], sessions: [] })),
  listCoverage: vi.fn(() => [{ userId: 7, status: "missing_start" }]),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("./accessControl", () => ({
  getEffectiveAccess: vi.fn(),
}));

vi.mock("./workShiftCoverageDb", () => ({
  loadWorkShiftCoverageData: mocks.loadCoverage,
}));

vi.mock("./workShiftCoverageService", async importOriginal => ({
  ...(await importOriginal<typeof import("./workShiftCoverageService")>()),
  listWorkShiftCoverage: mocks.listCoverage,
}));

import { workShiftSchedulesRouterDependencies } from "./workShiftSchedulesRuntime";

const actor = {
  userId: 7,
  organizationId: 10,
  organizationalUnitId: 20,
  permissions: ["work_shift_schedules.view"],
};

describe("workShiftSchedulesRuntime coverage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("carrega dados com escopo efetivo e delega a classificação ao serviço puro", async () => {
    const input = {
      from: new Date("2026-09-04T00:00:00.000Z"),
      until: new Date("2026-09-05T00:00:00.000Z"),
      organizationId: 10,
      organizationalUnitId: 20,
      teamId: 3,
    };

    const result = await workShiftSchedulesRouterDependencies.coverage(input, actor);

    expect(mocks.loadCoverage).toHaveBeenCalledWith(
      { kind: "db" },
      expect.objectContaining({
        from: input.from,
        until: input.until,
        organizationId: 10,
        organizationalUnitId: 20,
        teamId: 3,
      }),
    );
    expect(mocks.listCoverage).toHaveBeenCalledWith(expect.objectContaining({
      from: input.from,
      until: input.until,
      assignments: [],
      exceptions: [],
      sessions: [],
    }));
    expect(result).toEqual([{ userId: 7, status: "missing_start" }]);
  });

  it("rejeita organização fora do escopo antes de consultar o banco", async () => {
    await expect(workShiftSchedulesRouterDependencies.coverage({
      from: new Date("2026-09-04T00:00:00.000Z"),
      until: new Date("2026-09-05T00:00:00.000Z"),
      organizationId: 99,
    }, actor)).rejects.toThrow(/escopo organizacional/i);

    expect(mocks.loadCoverage).not.toHaveBeenCalled();
  });
});
