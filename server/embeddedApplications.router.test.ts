import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
}));

import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: {
      id: 31,
      openId: "embedded-app-rbac-test",
      name: "Operador integração",
      email: "embedded-app@test.local",
      loginMethod: "test",
      role: "user",
      operationalRole: "operador",
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

describe("RBAC de aplicações incorporadas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPermission.mockResolvedValue(undefined);
  });

  it("exige permissão específica para visualizar aplicações incorporadas", async () => {
    const caller = appRouter.createCaller(context());

    const result = await caller.integrations.embeddedApplications.list();

    expect(result.some(application => application.id === "neo-interact")).toBe(true);
    expect(mocks.assertPermission).toHaveBeenCalledWith(
      expect.objectContaining({ operationalRole: "operador" }),
      "embedded_apps.view",
    );
  });
});
