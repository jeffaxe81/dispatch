import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const page = readFileSync(resolve(projectRoot, "client/src/pages/Cp016OperationsPage.tsx"), "utf8");

describe("CP-016 operations page bindings", () => {
  it("reutiliza os endpoints atuais de equipes e jornada enquanto o backend CP-016 aguarda migration", () => {
    expect(page).toContain("trpc.teams.list.useQuery");
    expect(page).toContain("trpc.teams.updateShift.useMutation");
    expect(page).toContain("https://gscprj.saas.digitro.cloud/neo/");
  });
});
