import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConnection, type Connection } from "mysql2/promise";
import { createPool, type Pool } from "mysql2";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { assertEmptyHandoffSchema, getHandoffMysqlTestSettings } from "./test/handoffMysqlEnvironment";
import { setDbForTesting, listOwnShiftHandoffCandidates, listOwnPendingShiftHandoffs, requestOwnShiftHandoff, confirmOwnShiftHandoff } from "./db";

const settings = getHandoffMysqlTestSettings(process.env);
let conn: Connection;
let pool: Pool;
let orgA = 0, orgB = 0, teamA = 0, teamB = 0, actorA = 0, recipientA = 0, otherA = 0, actorB = 0;
let actorSession = 0;

async function insert(sql: string, args: Array<string | number | null>) {
  const [result] = await conn.execute<ResultSetHeader>(sql, args);
  expect(result.insertId).toBeGreaterThan(0);
  return result.insertId;
}

function scope(actorUserId = actorA, teamId = teamA, tenantId = orgA) {
  return { actorUserId, teamId, tenantId };
}

beforeAll(async () => {
  conn = await createConnection(settings);
  await conn.query("SET SESSION time_zone = '+00:00'");
  const [tables] = await conn.query<RowDataPacket[]>(
    "SELECT count(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  assertEmptyHandoffSchema(String(settings.database), Number(tables[0]?.total ?? -1));
  await migrate(drizzle({ client: conn }), { migrationsFolder: "drizzle" });
  pool = createPool({ ...settings, connectionLimit: 5 });
  setDbForTesting(drizzle({ client: pool }));
  orgA = await insert("INSERT INTO organizations (code, name) VALUES (?, ?)", ["handoff_a", "Handoff A"]);
  orgB = await insert("INSERT INTO organizations (code, name) VALUES (?, ?)", ["handoff_b", "Handoff B"]);
  teamA = await insert("INSERT INTO teams (code, name, agency, organization_id) VALUES (?, ?, ?, ?)",
    ["HANDOFF-A", "Equipe A", "Local", orgA]);
  teamB = await insert("INSERT INTO teams (code, name, agency, organization_id) VALUES (?, ?, ?, ?)",
    ["HANDOFF-B", "Equipe B", "Local", orgB]);
  async function user(code: string, teamId: number) {
    return insert("INSERT INTO users (openId, name, teamId, active) VALUES (?, ?, ?, true)",
      ["handoff-" + code, "Usuário " + code, teamId]);
  }
  actorA = await user("actor-a", teamA);
  recipientA = await user("recipient-a", teamA);
  otherA = await user("other-a", teamA);
  actorB = await user("actor-b", teamB);
  actorSession = await insert("INSERT INTO work_shift_sessions (user_id, team_id, started_at, status) VALUES (?, ?, UTC_TIMESTAMP(), 'active')",
    [actorA, teamA]);
  await insert("INSERT INTO work_shift_sessions (user_id, team_id, started_at, status) VALUES (?, ?, UTC_TIMESTAMP(), 'active')",
    [actorB, teamB]);
}, 120_000);

afterAll(async () => {
  setDbForTesting(null);
  if (pool) await new Promise<void>((resolve, reject) => pool.end(error => error ? reject(error) : resolve()));
  if (conn) await conn.end();
});

describe("AXED-F037 — confirmação real entre usuários e tenants em MySQL 8.4", () => {
  it("seleciona somente candidatos ativos da equipe no tenant autenticado", async () => {
    const list = await listOwnShiftHandoffCandidates(scope());
    expect(list.map(x => x.id)).toContain(recipientA);
    expect(list.map(x => x.id)).toContain(otherA);
    expect(list.map(x => x.id)).not.toContain(actorA);
    expect(list.map(x => x.id)).not.toContain(actorB);
  });

  it("nega tenant externo, mesmo que o usuário informe uma equipe existente", async () => {
    await expect(listOwnShiftHandoffCandidates(scope(actorA, teamA, orgB))).rejects.toThrow(/organização/);
    await expect(requestOwnShiftHandoff({ ...scope(actorA, teamA, orgB),
      recipientUserId: recipientA, note: "Repasse seguro de ocorrência." })).rejects.toThrow(/organização/);
  });

  it("nega responsável de outra equipe ou operador sem jornada aberta", async () => {
    await expect(requestOwnShiftHandoff({ ...scope(), recipientUserId: actorB,
      note: "Passar ocorrência prioritária." })).rejects.toThrow(/mesma equipe/);
    await expect(requestOwnShiftHandoff({ ...scope(otherA), recipientUserId: recipientA,
      note: "Passar ocorrência prioritária." })).rejects.toThrow(/Jornada/i);
  });

  it("registra solicitação, confirma pelo destinatário e preserva estado da jornada", async () => {
    const sent = await requestOwnShiftHandoff({ ...scope(), recipientUserId: recipientA,
      note: "Repasse integral das ocorrências prioritárias." });
    expect(sent.confirmed).toBe(false);
    const [events] = await conn.query<RowDataPacket[]>(
      "SELECT event_type, actor_user_id, metadata, reason FROM work_shift_events WHERE id = ?", [sent.requestId]);
    expect(events[0].event_type).toBe("handoff_requested");
    expect(events[0].actor_user_id).toBe(actorA);
    expect(events[0].metadata.recipientUserId).toBe(recipientA);

    const pending = await listOwnPendingShiftHandoffs(scope(recipientA));
    expect(pending.map(x => x.requestId)).toContain(sent.requestId);
    expect((await listOwnPendingShiftHandoffs(scope(actorB, teamB, orgB))).map(x => x.requestId))
      .not.toContain(sent.requestId);
    await expect(confirmOwnShiftHandoff({ ...scope(otherA), requestId: sent.requestId }))
      .rejects.toThrow(/escopo/);

    const confirmed = await confirmOwnShiftHandoff({ ...scope(recipientA), requestId: sent.requestId });
    expect(confirmed.confirmed).toBe(true);
    const [session] = await conn.query<RowDataPacket[]>(
      "SELECT status, ended_at FROM work_shift_sessions WHERE id = ?", [actorSession]);
    expect(session[0].status).toBe("active");
    expect(session[0].ended_at).toBeNull();
    expect((await listOwnPendingShiftHandoffs(scope(recipientA))).map(x => x.requestId))
      .not.toContain(sent.requestId);
    await expect(confirmOwnShiftHandoff({ ...scope(recipientA), requestId: sent.requestId }))
      .rejects.toThrow(/já confirmada/);
  });

  it("duas confirmações simultâneas são serializadas; só uma grava evento", async () => {
    const sent = await requestOwnShiftHandoff({ ...scope(), recipientUserId: recipientA,
      note: "Verificação simultânea do repasse operacional." });
    const result = await Promise.allSettled([
      confirmOwnShiftHandoff({ ...scope(recipientA), requestId: sent.requestId }),
      confirmOwnShiftHandoff({ ...scope(recipientA), requestId: sent.requestId }),
    ]);
    expect(result.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(result.filter(x => x.status === "rejected")).toHaveLength(1);
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT count(*) AS total FROM work_shift_events WHERE event_type='handoff_confirmed' AND JSON_EXTRACT(metadata,'$.handoffRequestId') = ?",
      [sent.requestId],
    );
    expect(Number(rows[0].total)).toBe(1);
  });

  it("expira passagem antiga e não permite a confirmação posterior", async () => {
    const sent = await requestOwnShiftHandoff({ ...scope(), recipientUserId: recipientA,
      note: "Registro para validar expiração da passagem." });
    await conn.execute("UPDATE work_shift_events SET occurred_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 9 HOUR) WHERE id = ?",
      [sent.requestId]);
    await expect(confirmOwnShiftHandoff({ ...scope(recipientA), requestId: sent.requestId }))
      .rejects.toThrow(/expirada/);
  });
});
