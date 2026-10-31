import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createConnection, type Connection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { assertEmptyAuditMysqlDatabase, getAuditMysqlTestSettings } from "./test/auditMysqlEnvironment";

type Grant = {
  roleCode: string;
  defaultScope: "global" | "organizacao" | "unidade" | "departamento" | "grupo" | "equipe";
  organizationId: number | null;
  organizationalUnitId: number | null;
  teamId: number | null;
};

const harness = vi.hoisted(() => ({
  db: null as unknown,
  snapshot: {
    assignments: [] as Array<Grant>,
    permissions: new Set<string>(),
  },
}));

// Only the disposable test harness replaces transport. Every read-model
// SELECT, including role-permission joins, runs against REAL MySQL 8.4.
vi.mock("./db", () => ({ getDb: async () => harness.db }));
vi.mock("./accessControl", () => ({ getAccessSnapshot: async () => harness.snapshot }));

import { listTenantOperationLogs } from "./tenantAuditReadModel";

const settings = getAuditMysqlTestSettings(process.env);
let conn: Connection;
let userId = 0;
let orgA = 0;
let orgB = 0;
let teamA1 = 0;
let teamA2 = 0;
let teamB1 = 0;
let incidentA1 = 0;
let incidentA2 = 0;
let incidentA3 = 0;
let incidentB1 = 0;
const roleIds: Record<string, number> = {};

async function insert(sql: string, params: Array<string | number | null>) {
  const [result] = await conn.execute<ResultSetHeader>(sql, params);
  expect(result.insertId).toBeGreaterThan(0);
  return result.insertId;
}

async function audit(resourceType: string, resourceId: number, action: string, afterData: Record<string, unknown> | null = null) {
  return insert(
    "INSERT INTO audit_logs (resource_type, resource_id, action, actor_user_id, after_data) VALUES (?, ?, ?, ?, ?)",
    [resourceType, resourceId, action, userId, afterData ? JSON.stringify(afterData) : null],
  );
}

async function addRole(code: string, scope: Grant["defaultScope"], permissionId: number) {
  const id = await insert("INSERT INTO access_roles (code, name, role_scope) VALUES (?, ?, ?)", [code, code, scope]);
  await conn.execute("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)", [id, permissionId]);
  roleIds[code] = id;
}

async function assignRole(
  code: string,
  scope: Grant["defaultScope"],
  organizationId: number | null,
  teamId: number | null = null,
) {
  await conn.execute(
    "INSERT INTO user_role_assignments (user_id, role_id, organization_id, team_id) VALUES (?, ?, ?, ?)",
    [userId, roleIds[code], organizationId, teamId],
  );
  harness.snapshot.assignments.push({
    roleCode: code, defaultScope: scope, organizationId,
    organizationalUnitId: null, teamId,
  });
}

function read(organizationId: number, options: {
  page?: number;
  pageSize?: number;
  resourceType?: string;
  search?: string;
} = {}) {
  return listTenantOperationLogs({
    actorUserId: userId,
    organizationId,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 100,
    resourceType: options.resourceType,
    search: options.search,
  });
}

beforeAll(async () => {
  conn = await createConnection(settings);
  await conn.query("SET SESSION time_zone = '+00:00'");
  const [tables] = await conn.query<RowDataPacket[]>(
    "SELECT count(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  assertEmptyAuditMysqlDatabase(String(settings.database), Number(tables[0]?.total ?? -1));
  await migrate(drizzle({ client: conn }), { migrationsFolder: "drizzle" });
  harness.db = drizzle({ client: conn });

  orgA = await insert("INSERT INTO organizations (code, name) VALUES (?, ?)", ["audit_a", "Audit A"]);
  orgB = await insert("INSERT INTO organizations (code, name) VALUES (?, ?)", ["audit_b", "Audit B"]);
  teamA1 = await insert("INSERT INTO teams (code, name, agency, organization_id) VALUES (?, ?, ?, ?)", ["audit_A1", "A1", "Local", orgA]);
  teamA2 = await insert("INSERT INTO teams (code, name, agency, organization_id) VALUES (?, ?, ?, ?)", ["audit_A2", "A2", "Local", orgA]);
  teamB1 = await insert("INSERT INTO teams (code, name, agency, organization_id) VALUES (?, ?, ?, ?)", ["audit_B1", "B1", "Local", orgB]);
  userId = await insert(
    "INSERT INTO users (openId, name) VALUES (?, ?)",
    ["audit-actor", "Auditor synthetic"],
  );

  async function incident(code: string, team: number | null, org: number) {
    const id = await insert(
      "INSERT INTO incidents (code, category, description, address, latitude, longitude, assigned_team_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [code, "test", "synthetic", "test", "-27.123", "-48.111", team, userId],
    );
    await conn.execute("INSERT INTO incident_tenant_scopes (incident_id, organization_id) VALUES (?, ?)", [id, org]);
    return id;
  }

  incidentA1 = await incident("AUDIT-A1", teamA1, orgA);
  incidentA2 = await incident("AUDIT-A2", teamA2, orgA);
  incidentA3 = await incident("AUDIT-A3", null, orgA);
  incidentB1 = await incident("AUDIT-B1", teamB1, orgB);

  const assignmentA = await insert("INSERT INTO incident_assignments (incident_id, team_id, dispatched_by_user_id) VALUES (?, ?, ?)", [incidentA1, teamA1, userId]);
  const assignmentB = await insert("INSERT INTO incident_assignments (incident_id, team_id, dispatched_by_user_id) VALUES (?, ?, ?)", [incidentB1, teamB1, userId]);
  const evidenceA = await insert("INSERT INTO incident_evidence (incident_id, storage_key, file_name, content_type, byte_size, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)", [incidentA1, "synthetic-a", "a.pdf", "application/pdf", 17, userId]);
  const evidenceB = await insert("INSERT INTO incident_evidence (incident_id, storage_key, file_name, content_type, byte_size, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)", [incidentB1, "synthetic-b", "b.pdf", "application/pdf", 17, userId]);
  const vehicleA = await insert("INSERT INTO vehicles (prefix, license_plate, type, team_id) VALUES (?, ?, ?, ?)", ["AUDITA", "AUD-A-1", "test", teamA1]);
  const vehicleB = await insert("INSERT INTO vehicles (prefix, license_plate, type, team_id) VALUES (?, ?, ?, ?)", ["AUDITB", "AUD-B-1", "test", teamB1]);
  await conn.execute("INSERT INTO vehicle_tenant_scopes (vehicle_id, organization_id) VALUES (?, ?), (?, ?)", [vehicleA, orgA, vehicleB, orgB]);

  // The SAME actor writes across both tenants. Ownership MUST come from the
  // linked resource rather than actor_user_id.
  await audit("incident", incidentA1, "alpha.created", { status: "triagem", code: "AUDIT-A1", requesterName: "PRIVATE", token: "SECRET" });
  await audit("incident", incidentA1, "alpha.updated", { status: "em_atendimento", address: "PRIVATE" });
  await audit("incident", incidentA2, "alpha.other");
  await audit("incident", incidentA3, "unassigned");
  await audit("incident", incidentB1, "alpha.cross");
  await audit("assignment", assignmentA, "team_assigned");
  await audit("assignment", assignmentB, "team_assigned");
  await audit("incident_evidence", evidenceA, "evidence_uploaded", { token: "SECRET" });
  await audit("incident_evidence", evidenceB, "evidence_uploaded");
  await audit("team", teamA1, "team_status_changed");
  await audit("team", teamB1, "team_status_changed");
  await audit("vehicle", vehicleA, "vehicle_status_changed");
  await audit("vehicle", vehicleB, "vehicle_status_changed");
  await audit("incident", 999999, "orphan");
  await audit("user", userId, "unsupported_user_audit", { token: "SECRET" });

  const auditPermission = await insert(
    "INSERT INTO access_permissions (code, resource, action) VALUES (?, ?, ?)",
    ["audit.view", "audit", "view"],
  );
  const teamPermission = await insert(
    "INSERT INTO access_permissions (code, resource, action) VALUES (?, ?, ?)",
    ["teams.view", "teams", "view"],
  );
  await addRole("audit_team_a", "equipe", auditPermission);
  await addRole("audit_org_a", "organizacao", auditPermission);
  await addRole("audit_global", "global", auditPermission);
  await addRole("non_audit_org_b", "organizacao", teamPermission);
}, 120_000);

beforeEach(async () => {
  await conn.query("DELETE FROM user_role_assignments");
  harness.snapshot.assignments = [];
  harness.snapshot.permissions = new Set(["audit.view"]);
});

afterAll(async () => {
  if (conn) await conn.end();
});

describe("AXED-F091 — read model real com MySQL 8.4 e dois tenants sintéticos", () => {
  it("separa registros de A e B por dono canônico apesar do ator compartilhado", async () => {
    await assignRole("audit_global", "global", null);
    const [a, b] = await Promise.all([read(orgA), read(orgB)]);
    expect(a.total).toBe(8);
    expect(b.total).toBe(5);
    expect(a.rows).toHaveLength(8);
    expect(b.rows).toHaveLength(5);
    expect(a.rows.every(x => x.audit.actorUserId === null)).toBe(true);
    expect(JSON.stringify(a)).not.toMatch(/PRIVATE|SECRET|audit-actor|Auditor synthetic/);
    const ownIds = new Set(a.rows.map(x => x.audit.id));
    expect(b.rows.every(x => !ownIds.has(x.audit.id))).toBe(true);
    expect(a.rows.find(x => x.audit.action === "alpha.created")?.audit.afterData).toMatchObject({
      code: "AUDIT-A1", status: "triagem",
    });
  });

  it("role organizacional A não amplia a leitura para B", async () => {
    await assignRole("audit_org_a", "organizacao", orgA);
    expect((await read(orgA)).total).toBe(8);
    expect((await read(orgB)).total).toBe(0);
  });

  it("role de equipe A1 não enxerga equipe A2, ocorrência sem equipe ou B", async () => {
    await assignRole("audit_team_a", "equipe", orgA, teamA1);
    const a = await read(orgA);
    expect(a.total).toBe(6);
    expect(a.rows.map(x => x.audit.action)).not.toContain("alpha.other");
    expect(a.rows.map(x => x.audit.action)).not.toContain("unassigned");
    expect((await read(orgB)).total).toBe(0);
  });

  it("role sem audit.view não concede acesso, mesmo quando há escopo organizacional B", async () => {
    await assignRole("non_audit_org_b", "organizacao", orgB);
    expect((await read(orgA)).total).toBe(0);
    expect((await read(orgB)).total).toBe(0);
  });

  it("misturar role audit A1 com role sem audit.view B não contamina os resultados", async () => {
    await assignRole("audit_team_a", "equipe", orgA, teamA1);
    await assignRole("non_audit_org_b", "organizacao", orgB);
    expect((await read(orgA)).total).toBe(6);
    expect((await read(orgB)).total).toBe(0);
  });

  it("aplica pesquisa, recurso, contagem e paginação antes de devolver resultados", async () => {
    await assignRole("audit_global", "global", null);
    const [page1, page2, b, unsupported] = await Promise.all([
      read(orgA, { search: "alpha", resourceType: "incident", pageSize: 2 }),
      read(orgA, { search: "alpha", resourceType: "incident", pageSize: 2, page: 2 }),
      read(orgB, { search: "alpha", resourceType: "incident" }),
      read(orgA, { resourceType: "user" }),
    ]);
    expect(page1.total).toBe(3);
    expect(page2.total).toBe(3);
    expect(page1.rows).toHaveLength(2);
    expect(page2.rows).toHaveLength(1);
    expect(new Set([...page1.rows, ...page2.rows].map(x => x.audit.id)).size).toBe(3);
    expect(b.total).toBe(1);
    expect(unsupported).toMatchObject({ rows: [], total: 0 });
  });

  it("oculta eventos órfãos, tipos sem vínculo canônico e conteúdo sensível", async () => {
    await assignRole("audit_global", "global", null);
    const a = await read(orgA);
    expect(a.rows.map(x => x.audit.action)).not.toContain("orphan");
    expect(a.rows.map(x => x.audit.action)).not.toContain("unsupported_user_audit");
    expect(a.rows.every(x => x.actorEmail === null)).toBe(true);
    expect(JSON.stringify(a)).not.toMatch(/PRIVATE|SECRET/);
  });

  it("rejeita paginação fora de limites sem alargar a query", async () => {
    await assignRole("audit_global", "global", null);
    await expect(read(orgA, { page: 0 })).rejects.toThrow(/paginação/i);
    await expect(read(orgA, { pageSize: 101 })).rejects.toThrow(/paginação/i);
  });
});
