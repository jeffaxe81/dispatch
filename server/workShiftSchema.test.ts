import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { workShiftEvents, workShiftSessions } from "../drizzle/workShiftSchema";

describe("work shift historical schema", () => {
  it("expõe as tabelas históricas da jornada", () => {
    expect(getTableName(workShiftSessions)).toBe("work_shift_sessions");
    expect(getTableName(workShiftEvents)).toBe("work_shift_events");
  });

  it("mantém usuário obrigatório e equipe opcional na sessão", () => {
    expect(workShiftSessions.userId.notNull).toBe(true);
    expect(workShiftSessions.teamId.notNull).toBe(false);
    expect(workShiftSessions.startedAt.notNull).toBe(true);
    expect(workShiftSessions.pausedSeconds.notNull).toBe(true);
  });

  it("mantém eventos vinculados à sessão sem exclusão em cascata", () => {
    expect(workShiftEvents.sessionId.notNull).toBe(true);
    expect(workShiftEvents.occurredAt.notNull).toBe(true);
    const sessionForeignKey = getTableConfig(workShiftEvents).foreignKeys.find(foreignKey =>
      foreignKey.reference().columns.some(column => column.name === "session_id"),
    );
    expect(sessionForeignKey?.onDelete).toBe("restrict");
  });
});
