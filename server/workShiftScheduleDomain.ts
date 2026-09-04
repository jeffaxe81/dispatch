import type { PlannedShiftWindow, WorkShiftExceptionType, WorkShiftScheduleType } from "../shared/workShiftSchedules";

export type WorkShiftScheduleSnapshot = {
  scheduleType: WorkShiftScheduleType;
  timezone: string;
  cycleAnchorAt: Date | null;
  plannedDurationMinutes: number;
  cycleWorkMinutes: number | null;
  cycleRestMinutes: number | null;
  startTimeLocal: string;
  weekdays: number[] | null;
};

export type WorkShiftScheduleExceptionSnapshot = {
  exceptionType: WorkShiftExceptionType;
  startsAt: Date;
  endsAt: Date;
};

const NONE: PlannedShiftWindow = {
  inPlannedWindow: false,
  plannedStartAt: null,
  plannedEndAt: null,
  source: "none",
};

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} deve ser um inteiro positivo`);
}

function assertValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error(`timezone inválido: ${timezone}`);
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
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return representedAsUtc - instant.getTime();
}

function zonedLocalToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(localAsUtc);

  for (let i = 0; i < 3; i += 1) {
    candidate = new Date(localAsUtc - timezoneOffsetMs(candidate, timezone));
  }

  return candidate;
}

function parseStartTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("startTimeLocal deve usar HH:mm");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("startTimeLocal inválido");
  return { hour, minute };
}

function previousCalendarDate(year: number, month: number, day: number) {
  const previous = new Date(Date.UTC(year, month - 1, day) - 86_400_000);
  return {
    year: previous.getUTCFullYear(),
    month: previous.getUTCMonth() + 1,
    day: previous.getUTCDate(),
  };
}

function fixedCandidate(schedule: WorkShiftScheduleSnapshot, instant: Date, date: { year: number; month: number; day: number }) {
  const weekdays = schedule.weekdays ?? [];
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  if (!weekdays.includes(weekday)) return null;

  const { hour, minute } = parseStartTime(schedule.startTimeLocal);
  const plannedStartAt = zonedLocalToUtc(date.year, date.month, date.day, hour, minute, schedule.timezone);
  const plannedEndAt = new Date(plannedStartAt.getTime() + schedule.plannedDurationMinutes * 60_000);
  if (instant < plannedStartAt || instant >= plannedEndAt) return null;

  return {
    inPlannedWindow: true,
    plannedStartAt,
    plannedEndAt,
    source: "schedule" as const,
  };
}

function resolveFixed(schedule: WorkShiftScheduleSnapshot, instant: Date): PlannedShiftWindow {
  if (!schedule.weekdays?.length) throw new Error("weekdays é obrigatório para escala fixed");
  assertPositiveInteger(schedule.plannedDurationMinutes, "plannedDurationMinutes");
  assertValidTimezone(schedule.timezone);

  const current = localParts(instant, schedule.timezone);
  const today = { year: current.year, month: current.month, day: current.day };
  const yesterday = previousCalendarDate(current.year, current.month, current.day);

  return fixedCandidate(schedule, instant, today) ?? fixedCandidate(schedule, instant, yesterday) ?? NONE;
}

function resolve12x36(schedule: WorkShiftScheduleSnapshot, instant: Date): PlannedShiftWindow {
  assertValidTimezone(schedule.timezone);
  if (!schedule.cycleAnchorAt) throw new Error("cycleAnchorAt é obrigatório para escala 12x36");
  if (schedule.cycleWorkMinutes !== 720) throw new Error("cycleWorkMinutes deve ser 720 na escala 12x36");
  if (schedule.cycleRestMinutes !== 2160) throw new Error("cycleRestMinutes deve ser 2160 na escala 12x36");
  if (schedule.plannedDurationMinutes !== 720) throw new Error("plannedDurationMinutes deve ser 720 na escala 12x36");

  const workMs = 720 * 60_000;
  const cycleMs = (720 + 2160) * 60_000;
  const delta = instant.getTime() - schedule.cycleAnchorAt.getTime();
  const cycleIndex = Math.floor(delta / cycleMs);
  const plannedStartAt = new Date(schedule.cycleAnchorAt.getTime() + cycleIndex * cycleMs);
  const plannedEndAt = new Date(plannedStartAt.getTime() + workMs);

  if (instant < plannedStartAt || instant >= plannedEndAt) return NONE;

  return {
    inPlannedWindow: true,
    plannedStartAt,
    plannedEndAt,
    source: "schedule",
  };
}

export function resolvePlannedShift(schedule: WorkShiftScheduleSnapshot, instant: Date): PlannedShiftWindow {
  if (Number.isNaN(instant.getTime())) throw new Error("instant inválido");

  switch (schedule.scheduleType) {
    case "fixed":
      return resolveFixed(schedule, instant);
    case "cyclic_12x36":
      return resolve12x36(schedule, instant);
    case "custom_cycle":
      throw new Error("custom_cycle ainda não é suportado na D-007B inicial");
  }
}

function overlaps(window: PlannedShiftWindow, exception: WorkShiftScheduleExceptionSnapshot) {
  if (!window.plannedStartAt || !window.plannedEndAt) return false;
  return exception.startsAt < window.plannedEndAt && exception.endsAt > window.plannedStartAt;
}

export function applyScheduleExceptions(
  window: PlannedShiftWindow,
  exceptions: WorkShiftScheduleExceptionSnapshot[],
): PlannedShiftWindow {
  const valid = exceptions.filter(exception => exception.startsAt < exception.endsAt);

  const replacement = valid.find(exception => exception.exceptionType === "replacement_shift" || exception.exceptionType === "extra_call");
  if (replacement) {
    return {
      inPlannedWindow: true,
      plannedStartAt: replacement.startsAt,
      plannedEndAt: replacement.endsAt,
      source: "exception",
    };
  }

  const blocked = valid.some(exception =>
    ["day_off", "leave", "holiday_override"].includes(exception.exceptionType) && overlaps(window, exception),
  );
  return blocked ? NONE : window;
}
