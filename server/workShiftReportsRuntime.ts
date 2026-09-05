import { resolveAuthorizedTeamFilter } from "./accessControl";
import { getDb } from "./db";
import { loadWorkShiftCoverageData } from "./workShiftCoverageDb";
import { listWorkShiftCoverage } from "./workShiftCoverageService";
import { createWorkShiftReportDb } from "./workShiftReportDb";
import { buildWorkShiftReport } from "./workShiftReportService";
import type { WorkShiftReportFilters } from "../shared/workShiftReports";
import type { WorkShiftReportsRouterDependencies } from "./workShiftReportsRouter";

const DEFAULT_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

type CurrentUser = Parameters<typeof resolveAuthorizedTeamFilter>[0];

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

function normalizePeriod(input: WorkShiftReportFilters, now: Date) {
  const to = input.to ?? now;
  const from = input.from ?? new Date(to.getTime() - DEFAULT_RANGE_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error("Período de relatório inválido.");
  }
  return { from, to };
}

async function scopedFilters(
  user: CurrentUser,
  input: WorkShiftReportFilters,
  permission: "work_shift_reports.view" | "work_shift_reports.export",
): Promise<WorkShiftReportFilters> {
  const teamId = await resolveAuthorizedTeamFilter(user, input.teamId, permission);
  return { ...input, teamId };
}

async function buildScopedReport(
  user: CurrentUser,
  input: WorkShiftReportFilters,
  permission: "work_shift_reports.view" | "work_shift_reports.export",
  evaluatedAt: Date,
) {
  const db = await requireDb();
  const reportDb = createWorkShiftReportDb(db);
  const filters = await scopedFilters(user, input, permission);
  const sessions = await reportDb.listSessions(filters);
  const adjusted = await reportDb.listApprovedAdjustmentSessionIds(sessions.map(session => session.id));
  const report = buildWorkShiftReport({ sessions, filters, evaluatedAt, approvedAdjustmentSessionIds: adjusted });
  return { reportDb, filters, report };
}

export const workShiftReportsRouterDependencies: WorkShiftReportsRouterDependencies = {
  async overview(input, user) {
    const evaluatedAt = new Date();
    const { report } = await buildScopedReport(user, input, "work_shift_reports.view", evaluatedAt);
    return report;
  },

  async sessions(input, user) {
    const evaluatedAt = new Date();
    const { report } = await buildScopedReport(user, input, "work_shift_reports.view", evaluatedAt);
    return { evaluatedAt: report.evaluatedAt, rows: report.rows };
  },

  async coverage(input, user) {
    const evaluatedAt = new Date();
    const filters = await scopedFilters(user, input, "work_shift_reports.view");
    const { from, to } = normalizePeriod(filters, evaluatedAt);
    const db = await requireDb();
    const data = await loadWorkShiftCoverageData(db, { from, until: to, teamId: filters.teamId });
    const rows = listWorkShiftCoverage({ from, until: to, now: evaluatedAt, ...data });
    return rows.filter(row => filters.userId === undefined || row.userId === filters.userId);
  },

  async exportReport(input, user) {
    const evaluatedAt = new Date();
    const { format, ...rawFilters } = input;
    const { reportDb, filters, report } = await buildScopedReport(user, rawFilters, "work_shift_reports.export", evaluatedAt);
    await reportDb.auditExport({
      actorUserId: user.id,
      format,
      filters,
      summary: report.summary,
      rowCount: report.rows.length,
    });
    return {
      format,
      evaluatedAt: report.evaluatedAt,
      rowCount: report.rows.length,
      rows: report.rows,
      summary: report.summary,
    };
  },
};
