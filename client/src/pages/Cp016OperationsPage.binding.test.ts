import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");
const page = readFileSync(resolve(projectRoot, "client/src/pages/Cp016OperationsPage.tsx"), "utf8");

describe("CP-016 operations page bindings", () => {
  it("usa os endpoints CP-016 para jornada e integração NEO", () => {
    expect(page).toContain("trpc.teams.list.useQuery");
    expect(page).toContain("trpc.cp016.shift.update.useMutation");
    expect(page).toContain("trpc.cp016.embeddedIntegrations.listMine.useQuery");
    expect(page).not.toContain("trpc.teams.updateShift.useMutation");
    expect(page).not.toContain("const NEO_INTEGRATION");
  });
});
