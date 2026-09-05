import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import {
  workShiftAssignments,
  workShiftScheduleExceptions,
  workShiftSchedules,
  workShiftSessions,
} from "../drizzle/workShiftSchema";

function column(table: Parameters<typeof getTableConfig>[0], name: string) {
  const found = getTableConfig(table).columns.find(item => item.name === name);
  if (!found) throw new Error(`Coluna ausente: ${name}`);
  return found;
}

describe("D-007B schedule schema", () => {
  it("expõe tabelas de escala, associação e exceção", () => {
    expect(getTableName(workShiftSchedules)).toBe("work_shift_schedules");
    expect(getTableName(workShiftAssignments)).toBe("work_shift_assignments");
    expect(getTableName(workShiftScheduleExceptions)).toBe("work_shift_schedule_exceptions");
  });

  it("mantém usuário obrigatório e equipe opcional na associação", () => {
    expect(column(workShiftAssignments, "user_id").notNull).toBe(true);
    expect(column(workShiftAssignments, "team_id").notNull).toBe(false);
    expect(column(workShiftAssignments, "schedule_id").notNull).toBe(true);
  });

  it("adiciona snapshot planejado opcional à sessão realizada", () => {
    expect(column(workShiftSessions, "schedule_assignment_id").notNull).toBe(false);
    expect(column(workShiftSessions, "scheduled_start_at").notNull).toBe(false);
    expect(column(workShiftSessions, "scheduled_end_at").notNull).toBe(false);
  });

  it("mantém exceção vinculada à associação com período obrigatório", () => {
    expect(column(workShiftScheduleExceptions, "assignment_id").notNull).toBe(true);
    expect(column(workShiftScheduleExceptions, "starts_at").notNull).toBe(true);
    expect(column(workShiftScheduleExceptions, "ends_at").notNull).toBe(true);
  });
});
