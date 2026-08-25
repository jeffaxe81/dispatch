import { describe, expect, it } from "vitest";
import { getOrganizationalUnitParentIssue } from "./db";

const units = [
  { id: 1, organizationId: 10, parentId: null },
  { id: 2, organizationId: 10, parentId: 1 },
  { id: 3, organizationId: 10, parentId: 2 },
  { id: 4, organizationId: 20, parentId: null },
] as const;

describe("hierarquia de unidades organizacionais", () => {
  it("impede que uma unidade se torne pai de si mesma ou de sua descendente", () => {
    expect(getOrganizationalUnitParentIssue({ unitId: 2, organizationId: 10, parentId: 2, units: [...units] })).toContain("si mesma");
    expect(getOrganizationalUnitParentIssue({ unitId: 1, organizationId: 10, parentId: 3, units: [...units] })).toContain("filha");
  });

  it("impede vínculos entre organizações diferentes e permite uma hierarquia válida", () => {
    expect(getOrganizationalUnitParentIssue({ unitId: 2, organizationId: 10, parentId: 4, units: [...units] })).toContain("mesma organização");
    expect(getOrganizationalUnitParentIssue({ unitId: 3, organizationId: 10, parentId: 1, units: [...units] })).toBeNull();
  });
});
