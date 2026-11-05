import { describe, expect, it } from "vitest";
import { hasOnlyGlobalAssignmentsForAudit, type AccessAssignment } from "./accessControl";

const assignment = (defaultScope: AccessAssignment["defaultScope"]): AccessAssignment => ({
  roleCode: "auditor",
  defaultScope,
  organizationId: defaultScope === "organizacao" ? 7 : null,
  organizationalUnitId: null,
  teamId: defaultScope === "equipe" ? 3 : null,
});

describe("restrição conservadora da auditoria global", () => {
  it("preserva legado sem assignments dinâmicos", () => {
    expect(hasOnlyGlobalAssignmentsForAudit([])).toBe(true);
  });

  it("permite apenas assignments globais canônicos", () => {
    expect(hasOnlyGlobalAssignmentsForAudit([assignment("global")])).toBe(true);
    expect(hasOnlyGlobalAssignmentsForAudit([assignment("global"), assignment("global")])).toBe(true);
  });

  it("nega qualquer assignment com escopo limitado, mesmo misturado a papel global", () => {
    for (const scope of ["organizacao", "unidade", "departamento", "grupo", "equipe"] as const) {
      expect(hasOnlyGlobalAssignmentsForAudit([assignment(scope)])).toBe(false);
      expect(hasOnlyGlobalAssignmentsForAudit([assignment("global"), assignment(scope)])).toBe(false);
    }
  });

  it("nega vínculo marcado global quando carrega restrição persistida incompatível", () => {
    expect(hasOnlyGlobalAssignmentsForAudit([{ ...assignment("global"), organizationId: 7 }])).toBe(false);
    expect(hasOnlyGlobalAssignmentsForAudit([{ ...assignment("global"), organizationalUnitId: 2 }])).toBe(false);
    expect(hasOnlyGlobalAssignmentsForAudit([{ ...assignment("global"), teamId: 3 }])).toBe(false);
  });
});
