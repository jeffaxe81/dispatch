import { describe, expect, it } from "vitest";

const loadContract = () => import("./centralRbacContract.ts?raw");
const loadSchema = () => import("./rbacAssignmentSourceSchema.ts?raw");
const loadMigration = () => import("../../drizzle/0012_d012e_workflow_tenant_rbac.sql?raw");
const loadConfig = () => import("../../drizzle.config.ts?raw");

describe("D-012E central RBAC provenance boundary", () => {
  it("defines a provider-neutral contract without transport or vendor coupling", async () => {
    const { default: contract } = await loadContract();

    expect(contract).toContain("CentralRbacAssignmentRecord");
    expect(contract).toContain("CentralRbacProvider");
    expect(contract).toContain("sourceKey");
    expect(contract).toContain("sourceRevision");
    expect(contract).not.toMatch(/SCIM|LDAP|OIDC|axios|fetch\s*\(|webhook|polling/i);
  });

  it("keeps external provenance optional and separate from local role assignments", async () => {
    const [{ default: schema }, { default: migration }, { default: config }] = await Promise.all([
      loadSchema(),
      loadMigration(),
      loadConfig(),
    ]);

    expect(schema).toContain("rbacAssignmentSources");
    expect(schema).toContain('"rbac_assignment_sources"');
    expect(schema).toContain("userRoleAssignments.id");
    expect(schema).not.toContain("accessPermissions");
    expect(migration).toContain("CREATE TABLE `rbac_assignment_sources`");
    expect(migration).toContain("FOREIGN KEY (`assignment_id`) REFERENCES `user_role_assignments`(`id`) ON DELETE CASCADE");
    expect(config).toContain("./server/rbac/rbacAssignmentSourceSchema.ts");
  });
});
