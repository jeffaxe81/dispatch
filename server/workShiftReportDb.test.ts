import { describe, expect, it } from "vitest";
import { createWorkShiftReportDb } from "./workShiftReportDb";

describe("D-007D2 work shift report db", () => {
  it("expõe somente leitura e auditoria de exportação", () => {
    const store = createWorkShiftReportDb({} as never);
    expect(Object.keys(store).sort()).toEqual([
      "auditExport",
      "listApprovedAdjustmentSessionIds",
      "listSessions",
    ]);
  });
});
