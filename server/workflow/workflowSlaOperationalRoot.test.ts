import { describe, expect, it } from "vitest";
import { rootRouter } from "../rootRouter";

describe("D-012J — root router", () => {
  it("expõe a leitura operacional SLA sem remover os módulos existentes", () => {
    const procedures = rootRouter._def.procedures;
    expect(procedures["workflowSlaOperational.list"]).toBeDefined();
    expect(procedures["workflowSlaAdminReplay.replay"]).toBeDefined();
    expect(procedures["workspace.getOwn"]).toBeDefined();
    expect(procedures["dispatch.rankEligibleCandidates"]).toBeDefined();
  });
});
