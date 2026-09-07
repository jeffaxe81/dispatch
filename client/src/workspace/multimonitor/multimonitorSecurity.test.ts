import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("D-010B multi-monitor security regression", () => {
  it("keeps external workspace navigation same-origin and free of tenant/user authority", () => {
    const manager = read("client/src/workspace/multimonitor/MultiMonitorManager.ts");

    expect(manager).toContain("/workspace/external?");
    expect(manager).toContain("workspace: this.workspaceName");
    expect(manager).toContain("screen: screenId");
    expect(manager).not.toContain("tenantId");
    expect(manager).not.toContain("userId");
    expect(manager).not.toContain("http://");
    expect(manager).not.toContain("https://");
  });

  it("keeps the external route strict and backend-authorized", () => {
    const page = read("client/src/pages/WorkspaceExternalScreenPage.tsx");
    const router = read("server/routers/workspace.ts");

    expect(page).toContain('trpc.workspace.getOwnScreen');
    expect(page).toContain('const allowed = new Set(["workspace", "screen"])');
    expect(page).toContain('for (const key of params.keys()) if (!allowed.has(key)) return null');
    expect(page).not.toContain('tenantId:');
    expect(page).not.toContain('userId:');
    expect(router).toContain('getOwnScreen');
    expect(router).toContain('screenId');
    expect(router).toContain('NOT_FOUND');
  });

  it("keeps widgets and cross-window events on closed allowlists", () => {
    const registry = read("client/src/workspace/widgetRegistry.ts");
    const channel = read("client/src/workspace/multimonitor/workspaceChannel.ts");

    expect(registry).toContain("workspaceWidgetRegistry");
    expect(registry).toContain("Object.prototype.hasOwnProperty.call(workspaceWidgetRegistry, type)");
    expect(registry).not.toContain("eval(");
    expect(registry).not.toContain("new Function");
    expect(channel).toContain("workspace-screen-opened");
    expect(channel).toContain("workspace-screen-closed");
    expect(channel).toContain("workspace-layout-updated");
    expect(channel).toContain("workspace-refresh-requested");
    expect(channel).toContain("workspace-focus-screen");
    expect(channel).not.toContain("execute-script");
  });

  it("registers D-010B security invariants in the repository safety gate and documentation", () => {
    const security = read("scripts/security-regression-check.mjs");
    const trpcCoverage = read("docs/TRPC_CONTRACT_COVERAGE.md");
    const routeMatrix = read("docs/UI_ROUTE_STATE_MATRIX.md");

    expect(security).toContain("D-010B");
    expect(security).toContain("MultiMonitorManager.ts");
    expect(security).toContain("workspaceChannel.ts");
    expect(security).toContain("WorkspaceExternalScreenPage.tsx");
    expect(trpcCoverage).toContain("workspace.getOwnScreen");
    expect(routeMatrix).toContain("/workspace/external");
  });
});
