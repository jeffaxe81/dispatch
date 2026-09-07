import { describe, expect, it, vi } from "vitest";
import { createWorkspaceAccessContextResolver } from "./workspaceAccessContext";

const baseUser = {
  id: 7,
  openId: "workspace-user",
  role: "user" as const,
  operationalRole: "operador" as const,
  teamId: 5 as number | null,
  active: true,
};

describe("workspace access context", () => {
  it("resolves tenant from the authenticated user's team and maps permissions to widgets", async () => {
    const resolve = createWorkspaceAccessContextResolver({
      findTeamOrganizationId: vi.fn(async () => 42),
      getEffectiveAccess: vi.fn(async () => ({
        permissions: ["occurrences.view", "teams.view"],
        assignments: [],
      })),
    });

    const result = await resolve({ user: baseUser } as never);

    expect(result.tenantId).toBe(42);
    expect(result.userId).toBe(7);
    expect(result.allowedWidgetTypes).toEqual(new Set([
      "operational-map",
      "metrics",
      "priority-queue",
      "incidents",
      "teams",
    ]));
  });

  it("resolves a teamless user only when exactly one authorized organization exists", async () => {
    const resolve = createWorkspaceAccessContextResolver({
      findTeamOrganizationId: vi.fn(async () => null),
      getEffectiveAccess: vi.fn(async () => ({
        permissions: ["occurrences.view"],
        assignments: [
          { organizationId: 77 },
          { organizationId: 77 },
        ],
      })),
    });

    const result = await resolve({ user: { ...baseUser, teamId: null } } as never);
    expect(result.tenantId).toBe(77);
  });

  it("fails closed for a teamless user with zero or multiple organizations", async () => {
    const zero = createWorkspaceAccessContextResolver({
      findTeamOrganizationId: vi.fn(async () => null),
      getEffectiveAccess: vi.fn(async () => ({ permissions: ["occurrences.view"], assignments: [] })),
    });
    await expect(zero({ user: { ...baseUser, teamId: null } } as never)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const multiple = createWorkspaceAccessContextResolver({
      findTeamOrganizationId: vi.fn(async () => null),
      getEffectiveAccess: vi.fn(async () => ({
        permissions: ["occurrences.view"],
        assignments: [{ organizationId: 10 }, { organizationId: 20 }],
      })),
    });
    await expect(multiple({ user: { ...baseUser, teamId: null } } as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fails closed for inactive or unauthenticated users", async () => {
    const resolve = createWorkspaceAccessContextResolver({
      findTeamOrganizationId: vi.fn(async () => 42),
      getEffectiveAccess: vi.fn(async () => ({ permissions: ["occurrences.view"], assignments: [] })),
    });

    await expect(resolve({ user: { ...baseUser, active: false } } as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolve({ user: null } as never)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
