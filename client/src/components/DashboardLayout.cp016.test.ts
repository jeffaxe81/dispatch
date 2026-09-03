import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");
const layout = readFileSync(resolve(projectRoot, "client/src/components/DashboardLayout.tsx"), "utf8");

describe("CP-016 navigation", () => {
  it("expõe Operação integrada somente no fluxo protegido por dispatch.view", () => {
    expect(layout).toContain('label: "Operação integrada", path: "/operacao-integrada"');
    expect(layout).toContain('can("dispatch.view")');
  });
});
