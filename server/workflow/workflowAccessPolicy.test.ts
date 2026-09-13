import { describe, expect, it } from "vitest";
import { WORKFLOW_PERMISSIONS, isUserAuthorizedForOrganization } from "./workflowAccessPolicy";

describe("D-012E workflow RBAC policy", () => {
  it("define permissões de workflow e tarefa", () => {
    expect(WORKFLOW_PERMISSIONS.view).toBe("workflows.view");
    expect(WORKFLOW_PERMISSIONS.publish).toBe("workflows.publish");
    expect(WORKFLOW_PERMISSIONS.taskAct).toBe("workflow_tasks.act");
  });

  it("autoriza apenas assignments globais ou da organização", () => {
    expect(isUserAuthorizedForOrganization([{ roleCode: "gestor", defaultScope: "organizacao", organizationId: 10, organizationalUnitId: null, teamId: null }], 10)).toBe(true);
    expect(isUserAuthorizedForOrganization([{ roleCode: "gestor", defaultScope: "organizacao", organizationId: 11, organizationalUnitId: null, teamId: null }], 10)).toBe(false);
    expect(isUserAuthorizedForOrganization([], 10)).toBe(false);
  });
});
