import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Home workspace multi-monitor wiring", () => {
  it("carrega o workspace autorizado e expõe o launcher operacional", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/Home.tsx"), "utf8");

    expect(source).toContain('import { WorkspaceOperationLauncher } from "@/workspace/multimonitor/WorkspaceOperationLauncher";');
    expect(source).toContain('trpc.workspace.getOwn.useQuery({ name: "default" })');
    expect(source).toContain('<WorkspaceOperationLauncher screens={workspaceLayout.data.screens} />');
  });
});
