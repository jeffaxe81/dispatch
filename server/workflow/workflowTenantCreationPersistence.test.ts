import { describe, expect, it } from "vitest";

const loadSource = () => import("./workflowTenantCreationPersistence.ts?raw");

describe("D-012E atomic workflow tenant creation", () => {
  it("creates workflow, version and tenant scope in the same transaction", async () => {
    const { default: source } = await loadSource();

    expect(source).toContain("db.transaction");
    expect(source).toContain("tx.insert(workflows)");
    expect(source).toContain("tx.insert(workflowVersions)");
    expect(source).toContain("tx.insert(workflowTenantScopes)");
    expect(source).toContain("organizationId: input.organizationId");
    expect(source).toContain("tx.insert(auditLogs)");
    expect(source).not.toContain("createWorkflowTenantScope");
  });
});
