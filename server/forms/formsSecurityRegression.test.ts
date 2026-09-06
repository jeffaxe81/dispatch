import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("D-008 security regression gate", () => {
  it("mantém invariantes críticas no security:check", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/security-regression-check.mjs"), "utf8");
    expect(source).toContain("server/forms/formsTrpcRouter.ts");
    expect(source).toContain("server/forms/formsRouter.ts");
    expect(source).toContain("server/forms/formAttachments.ts");
    expect(source).toContain("server/rootRouter.ts");
    expect(source).toContain("assertSubmissionScope");
    expect(source).toContain("stored.key");
  });
});
