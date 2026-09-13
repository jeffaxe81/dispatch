import { describe, expect, it } from "vitest";
import { WORKFLOW_PERMISSIONS, isUserAuthorizedForOrganization } from "./workflowAccessPolicy";

const loadPolicySource = () => import("./workflowAccessPolicy.ts?raw");

describe("D-012E workflow RBAC policy", () => {
  it("reutiliza permissões canônicas de workflow e adiciona apenas permissões de tarefa", () => {
    expect(WORKFLOW_PERMISSIONS).toMatchObject({
      view: "workflow.view",
      create: "workflow.create",
      edit: "workflow.edit",
      publish: "workflow.activate",
      delete: "workflow.delete",
      execute: "workflow.execute",
      taskView: "workflow_tasks.view",
      taskAssign: "workflow_tasks.assign",
      taskAct: "workflow_tasks.act",
    });
  });

  it("autoriza apenas assignments globais ou da organização", () => {
    expect(isUserAuthorizedForOrganization([{ roleCode: "gestor", defaultScope: "organizacao", organizationId: 10, organizationalUnitId: null, teamId: null }], 10)).toBe(true);
    expect(isUserAuthorizedForOrganization([{ roleCode: "gestor", defaultScope: "organizacao", organizationId: 11, organizationalUnitId: null, teamId: null }], 10)).toBe(false);
    expect(isUserAuthorizedForOrganization([], 10)).toBe(false);
  });

  it("delega enforcement ao RBAC existente sem criar regra por papel operacional", async () => {
    const { default: source } = await loadPolicySource();
    expect(source).toContain("assertWorkflowPermission");
    expect(source).toContain("assertPermission");
    expect(source).not.toContain("operationalRole ===");
  });
});
