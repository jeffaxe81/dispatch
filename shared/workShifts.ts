export const WORK_SHIFT_ACTIONS = ["start", "pause", "resume", "end"] as const;
export const WORK_SHIFT_STATUSES = ["active", "paused", "ended", "cancelled"] as const;
export const WORK_SHIFT_EVENT_TYPES = ["started", "paused", "resumed", "ended", "cancelled"] as const;
export const WORK_SHIFT_SOURCES = ["self", "supervisor", "admin", "migration", "system"] as const;

export type WorkShiftAction = (typeof WORK_SHIFT_ACTIONS)[number];
export type WorkShiftStatus = (typeof WORK_SHIFT_STATUSES)[number];
export type WorkShiftEventType = (typeof WORK_SHIFT_EVENT_TYPES)[number];
export type WorkShiftSource = (typeof WORK_SHIFT_SOURCES)[number];
