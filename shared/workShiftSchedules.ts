export const WORK_SHIFT_SCHEDULE_TYPES = ["fixed", "cyclic_12x36", "custom_cycle"] as const;
export const WORK_SHIFT_EXCEPTION_TYPES = ["day_off", "replacement_shift", "leave", "extra_call", "holiday_override"] as const;

export type WorkShiftScheduleType = (typeof WORK_SHIFT_SCHEDULE_TYPES)[number];
export type WorkShiftExceptionType = (typeof WORK_SHIFT_EXCEPTION_TYPES)[number];

export type PlannedShiftWindow = {
  inPlannedWindow: boolean;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  source: "schedule" | "exception" | "none";
};
