import { describe, expect, it } from "vitest";
import { rootRouter } from "../rootRouter";

describe("D-012I I5F — root router", () => {
  it("registra o replay administrativo SLA sem remover módulos existentes", () => {
    const procedures = rootRouter._def.procedures;

    expect(procedures["workflowSlaAdminReplay.replay"]).toBeDefined();
    expect(procedures["workspace.getOwn"]).toBeDefined();
    expect(procedures["forms.list"]).toBeDefined();
    expect(procedures["dispatch.rankEligibleCandidates"]).toBeDefined();
  });
});
