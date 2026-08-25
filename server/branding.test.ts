import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("configuração de marca", () => {
  it("expõe AXE Dispatch como título global da aplicação", () => {
    expect(process.env.VITE_APP_TITLE).toBe("AXE Dispatch");
  });

  it("usa a identidade vetorial da AXE Sistemas no cabeçalho e como favicon", () => {
    const projectRoot = resolve(import.meta.dirname, "..");
    const header = readFileSync(resolve(projectRoot, "client/src/components/DashboardLayout.tsx"), "utf8");
    const document = readFileSync(resolve(projectRoot, "client/index.html"), "utf8");

    expect(header).toContain("ShieldCheck");
    expect(header).toContain("AXE Sistemas");
    expect(document).toContain('rel="icon" href="data:image/svg+xml');
    expect(document).not.toContain("axe-sistemas-viking-mark_2bb3ebce.png");
  });
});
