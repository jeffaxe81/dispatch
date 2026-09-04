import { readFileSync } from "node:fs";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { workShiftEvents, workShiftSessions } from "../drizzle/workShiftSchema";

function column(table: Parameters<typeof getTableConfig>[0], name: string) {
  const found = getTableConfig(table).columns.find(item => item.name === name);
  if (!found) throw new Error(`Coluna ausente: ${name}`);
  return found;
}

describe("work shift historical schema", () => {
  it("expõe as tabelas históricas da jornada", () => {
    expect(getTableName(workShiftSessions)).toBe("work_shift_sessions");
    expect(getTableName(workShiftEvents)).toBe("work_shift_events");
  });

  it("mantém usuário obrigatório e equipe opcional na sessão", () => {
    expect(column(workShiftSessions, "user_id").notNull).toBe(true);
    expect(column(workShiftSessions, "team_id").notNull).toBe(false);
    expect(column(workShiftSessions, "started_at").notNull).toBe(true);
    expect(column(workShiftSessions, "paused_seconds").notNull).toBe(true);
  });

  it("mantém eventos vinculados à sessão sem exclusão em cascata", () => {
    expect(column(workShiftEvents, "session_id").notNull).toBe(true);
    expect(column(workShiftEvents, "occurred_at").notNull).toBe(true);
    const sessionForeignKey = getTableConfig(workShiftEvents).foreignKeys.find(foreignKey =>
      foreignKey.reference().columns.some(item => item.name === "session_id"),
    );
    expect(sessionForeignKey?.onDelete).toBe("restrict");
  });

  it("cataloga view/control sem conceder permissões a papéis", () => {
    const migration = readFileSync("drizzle/0003_d007a_work_shift_history.sql", "utf8");
    expect(migration).toContain("'work_shifts.view', 'work_shifts', 'view'");
    expect(migration).toContain("'work_shifts.control', 'work_shifts', 'control'");
    expect(migration).not.toContain("INSERT INTO `role_permissions`");
  });
});
