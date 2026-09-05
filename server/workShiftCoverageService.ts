import type { WorkShiftExceptionType, WorkShiftScheduleType } from "../shared/workShiftSchedules";

export type WorkShiftCoverageStatus = "completed" | "in_progress" | "missing_start";

export type WorkShiftCoverageSchedule = {
  id: number;
  code: string;
  name: string;
  organizationId: number;
  organizationalUnitId: number | null;
  scheduleType: WorkShiftScheduleType;
  timezone: string;
  startTimeLocal: string;
  weekdays: number[] | null;
  plannedDurationMinutes: number;
  breakPolicyMinutes: number | null;
  cycleAnchorAt: Date | null;
  cycleWorkMinutes: number | null;
  cycleRestMinutes: number | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  active: boolean;
};

export type WorkShiftCoverageAssignment = {
  id: number;
  scheduleId: number;
  userId: number;
  teamId: number | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  active: boolean;
  schedule: WorkShiftCoverageSchedule;
};

export type WorkShiftCoverageException = {
  id: number;
  assignmentId: number;
  exceptionType: WorkShiftExceptionType;
  startsAt: Date;
  endsAt: Date;
};

export type WorkShiftCoverageSession = {
  id: number;
  userId: number;
  scheduleAssignmentId: number | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  startedAt: Date;
  endedAt: Date | null;
  status: "active" | "paused" | "ended" | "cancelled";
};

export type WorkShiftCoverageRow = {
  assignmentId: number;
  scheduleId: number;
  scheduleCode: string;
  scheduleName: string;
  organizationId: number;
  organizationalUnitId: number | null;
  userId: number;
  teamId: number | null;
  plannedStartAt: Date;
  plannedEndAt: Date;
  sessionId: number | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  status: WorkShiftCoverageStatus;
  source: "schedule" | "exception";
};

type PlannedWindow = {
  plannedStartAt: Date;
  plannedEndAt: Date;
  source: "schedule" | "exception";
};

const DAY_MS = 86_400_000;

function overlaps(fromA: Date, untilA: Date, fromB: Date, untilB: Date) {
  return fromA < untilB && untilA > fromB;
}

function intervalContains(instant: Date, start: Date, end: Date) {
  return instant >= start && instant < end;
}

function assertRange(from: Date, until: Date) {
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime()) || from >= until) {
    throw new Error("Período de cobertura inválido.");
  }
}

function localParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function timezoneOffsetMs(instant: Date, timezone: string) {
  const parts = localParts(instant, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant.getTime();
}

function zonedLocalToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(localAsUtc);
  for (let i = 0; i < 3; i += 1) {
    candidate = new Date(localAsUtc - timezoneOffsetMs(candidate, timezone));
  }
  return candidate;
}

function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("startTimeLocal deve usar HH:mm");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("startTimeLocal inválido");
  return { hour, minute };
}

function assignmentWindowOverlaps(assignment: WorkShiftCoverageAssignment, start: Date, end: Date) {
  const assignmentEnd = assignment.effectiveUntil ?? new Date(8_640_000_000_000_000);
  return overlaps(start, end, assignment.effectiveFrom, assignmentEnd);
}

function scheduleWindowOverlaps(schedule: WorkShiftCoverageSchedule, start: Date, end: Date) {
  const scheduleEnd = schedule.effectiveUntil ?? new Date(8_640_000_000_000_000);
  return overlaps(start, end, schedule.effectiveFrom, scheduleEnd);
}

function enumerate12x36(assignment: WorkShiftCoverageAssignment, from: Date, until: Date): PlannedWindow[] {
  const schedule = assignment.schedule;
  if (!schedule.cycleAnchorAt) throw new Error("cycleAnchorAt é obrigatório para escala 12x36");
  if (schedule.plannedDurationMinutes !== 720 || schedule.cycleWorkMinutes !== 720 || schedule.cycleRestMinutes !== 2160) {
    throw new Error("Escala 12x36 deve usar 720 minutos de trabalho e 2160 minutos de descanso.");
  }

  const workMs = 720 * 60_000;
  const cycleMs = (720 + 2160) * 60_000;
  const anchorMs = schedule.cycleAnchorAt.getTime();
  let index = Math.floor((from.getTime() - anchorMs) / cycleMs) - 1;
  const windows: PlannedWindow[] = [];

  while (true) {
    const start = new Date(anchorMs + index * cycleMs);
    const end = new Date(start.getTime() + workMs);
    if (start >= until) break;
    if (
      overlaps(start, end, from, until) &&
      assignmentWindowOverlaps(assignment, start, end) &&
      scheduleWindowOverlaps(schedule, start, end)
    ) {
      windows.push({ plannedStartAt: start, plannedEndAt: end, source: "schedule" });
    }
    index += 1;
  }
  return windows;
}

function enumerateFixed(assignment: WorkShiftCoverageAssignment, from: Date, until: Date): PlannedWindow[] {
  const schedule = assignment.schedule;
  if (!schedule.weekdays?.length) throw new Error("Escala fixa deve informar weekdays.");
  if (schedule.plannedDurationMinutes <= 0) throw new Error("plannedDurationMinutes deve ser positivo.");
  const { hour, minute } = parseTime(schedule.startTimeLocal);
  const seenDates = new Set<string>();
  const windows: PlannedWindow[] = [];

  for (let cursor = from.getTime() - 2 * DAY_MS; cursor < until.getTime() + 2 * DAY_MS; cursor += DAY_MS) {
    const parts = localParts(new Date(cursor), schedule.timezone);
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    if (seenDates.has(key)) continue;
    seenDates.add(key);
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    if (!schedule.weekdays.includes(weekday)) continue;
    const start = zonedLocalToUtc(parts.year, parts.month, parts.day, hour, minute, schedule.timezone);
    const end = new Date(start.getTime() + schedule.plannedDurationMinutes * 60_000);
    if (
      overlaps(start, end, from, until) &&
      assignmentWindowOverlaps(assignment, start, end) &&
      scheduleWindowOverlaps(schedule, start, end)
    ) {
      windows.push({ plannedStartAt: start, plannedEndAt: end, source: "schedule" });
    }
  }
  return windows;
}

function enumerateBaseWindows(assignment: WorkShiftCoverageAssignment, from: Date, until: Date): PlannedWindow[] {
  if (!assignment.active || !assignment.schedule.active) return [];
  switch (assignment.schedule.scheduleType) {
    case "cyclic_12x36":
      return enumerate12x36(assignment, from, until);
    case "fixed":
      return enumerateFixed(assignment, from, until);
    case "custom_cycle":
      throw new Error("custom_cycle ainda não é suportado na cobertura D-007B.");
  }
}

function applyExceptions(
  assignment: WorkShiftCoverageAssignment,
  base: PlannedWindow[],
  exceptions: WorkShiftCoverageException[],
  from: Date,
  until: Date,
): PlannedWindow[] {
  const own = exceptions.filter(exception => exception.assignmentId === assignment.id && exception.startsAt < exception.endsAt);
  const blockedTypes = new Set<WorkShiftExceptionType>(["day_off", "leave", "holiday_override"]);
  const output: PlannedWindow[] = [];

  for (const window of base) {
    const overlapping = own.filter(exception => overlaps(window.plannedStartAt, window.plannedEndAt, exception.startsAt, exception.endsAt));
    if (overlapping.some(exception => blockedTypes.has(exception.exceptionType))) continue;
    const replacement = overlapping.find(exception => exception.exceptionType === "replacement_shift");
    if (replacement) {
      output.push({ plannedStartAt: replacement.startsAt, plannedEndAt: replacement.endsAt, source: "exception" });
    } else {
      output.push(window);
    }
  }

  for (const exception of own) {
    if (exception.exceptionType !== "extra_call") continue;
    if (!overlaps(exception.startsAt, exception.endsAt, from, until)) continue;
    if (!assignmentWindowOverlaps(assignment, exception.startsAt, exception.endsAt)) continue;
    output.push({ plannedStartAt: exception.startsAt, plannedEndAt: exception.endsAt, source: "exception" });
  }

  const unique = new Map<string, PlannedWindow>();
  for (const window of output) {
    unique.set(`${window.plannedStartAt.toISOString()}|${window.plannedEndAt.toISOString()}`, window);
  }
  return Array.from(unique.values());
}

function matchSession(
  assignment: WorkShiftCoverageAssignment,
  window: PlannedWindow,
  sessions: WorkShiftCoverageSession[],
) {
  const own = sessions.filter(session => session.userId === assignment.userId && session.status !== "cancelled");
  const exact = own.find(session =>
    session.scheduleAssignmentId === assignment.id &&
    session.scheduledStartAt?.getTime() === window.plannedStartAt.getTime() &&
    session.scheduledEndAt?.getTime() === window.plannedEndAt.getTime(),
  );
  if (exact) return exact;

  return own.find(session =>
    session.scheduleAssignmentId === assignment.id &&
    intervalContains(session.startedAt, window.plannedStartAt, window.plannedEndAt),
  ) ?? null;
}

function classify(session: WorkShiftCoverageSession | null): WorkShiftCoverageStatus {
  if (!session) return "missing_start";
  if (session.status === "ended") return "completed";
  return "in_progress";
}

export function listWorkShiftCoverage(input: {
  from: Date;
  until: Date;
  now?: Date;
  assignments: WorkShiftCoverageAssignment[];
  exceptions: WorkShiftCoverageException[];
  sessions: WorkShiftCoverageSession[];
}): WorkShiftCoverageRow[] {
  assertRange(input.from, input.until);
  const now = input.now ?? new Date();
  const rows: WorkShiftCoverageRow[] = [];

  for (const assignment of input.assignments) {
    const base = enumerateBaseWindows(assignment, input.from, input.until);
    const windows = applyExceptions(assignment, base, input.exceptions, input.from, input.until);
    for (const window of windows) {
      if (window.plannedStartAt > now) continue;
      const session = matchSession(assignment, window, input.sessions);
      rows.push({
        assignmentId: assignment.id,
        scheduleId: assignment.scheduleId,
        scheduleCode: assignment.schedule.code,
        scheduleName: assignment.schedule.name,
        organizationId: assignment.schedule.organizationId,
        organizationalUnitId: assignment.schedule.organizationalUnitId,
        userId: assignment.userId,
        teamId: assignment.teamId,
        plannedStartAt: window.plannedStartAt,
        plannedEndAt: window.plannedEndAt,
        sessionId: session?.id ?? null,
        actualStartAt: session?.startedAt ?? null,
        actualEndAt: session?.endedAt ?? null,
        status: classify(session),
        source: window.source,
      });
    }
  }

  return rows.sort((a, b) => {
    const byStart = a.plannedStartAt.getTime() - b.plannedStartAt.getTime();
    if (byStart !== 0) return byStart;
    const byUser = a.userId - b.userId;
    if (byUser !== 0) return byUser;
    return a.assignmentId - b.assignmentId;
  });
}
