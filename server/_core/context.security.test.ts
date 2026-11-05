import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";
import { authenticateLocalRequest } from "../localAuth";
import { reconcileOperationalRoleWithAssignments } from "../db";
import { createContext } from "./context";

vi.mock("../localAuth", () => ({
  authenticateLocalRequest: vi.fn(),
}));
vi.mock("../db", () => ({
  reconcileOperationalRoleWithAssignments: vi.fn(),
}));

const user = { id: 42, active: true, operationalRole: "agente", teamId: 10 } as User;
const contextInput = {
  req: { headers: {} },
  res: {},
} as unknown as Parameters<typeof createContext>[0];

describe("tRPC identity and authorization context", () => {
  beforeEach(() => {
    vi.mocked(authenticateLocalRequest).mockReset();
    vi.mocked(reconcileOperationalRoleWithAssignments).mockReset();
  });

  it("exposes only a successfully verified and reconciled user", async () => {
    vi.mocked(authenticateLocalRequest).mockResolvedValue(user);
    vi.mocked(reconcileOperationalRoleWithAssignments).mockResolvedValue(user);
    await expect(createContext(contextInput)).resolves.toMatchObject({ user });
  });

  it("rejects the session if RBAC reconciliation fails, instead of keeping a stale role", async () => {
    vi.mocked(authenticateLocalRequest).mockResolvedValue(user);
    vi.mocked(reconcileOperationalRoleWithAssignments).mockRejectedValue(new Error("DB indisponível"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(createContext(contextInput)).resolves.toMatchObject({ user: null });
      expect(warning).toHaveBeenCalledWith(expect.stringContaining("acesso negado"));
    } finally {
      warning.mockRestore();
    }
  });

  it("rejects the identity when persistent session verification fails", async () => {
    vi.mocked(authenticateLocalRequest).mockRejectedValue(new Error("registry offline"));
    await expect(createContext(contextInput)).resolves.toMatchObject({ user: null });
    expect(reconcileOperationalRoleWithAssignments).not.toHaveBeenCalled();
  });

  it("keeps unauthenticated public calls unauthenticated", async () => {
    vi.mocked(authenticateLocalRequest).mockResolvedValue(null);
    await expect(createContext(contextInput)).resolves.toMatchObject({ user: null });
    expect(reconcileOperationalRoleWithAssignments).not.toHaveBeenCalled();
  });
});
