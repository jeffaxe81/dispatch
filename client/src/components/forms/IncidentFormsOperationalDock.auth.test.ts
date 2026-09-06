import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("D-008 operational dock authorization source", () => {
  it("usa forms.capabilities como fonte única das ações do formulário", () => {
    const source = readFileSync(fileURLToPath(new URL("./IncidentFormsOperationalDock.tsx", import.meta.url)), "utf8");
    expect(source).toContain("trpc.forms.capabilities.useQuery");
    expect(source).not.toContain("trpc.access.me.useQuery");
    expect(source).toContain("capabilities.data?.canFill");
    expect(source).toContain("capabilities.data?.canCorrectResponses");
  });
});
