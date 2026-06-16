import { parse, differenceInMinutes, startOfDay, addDays } from "date-fns";

export function getShiftStartDateTime(
  shiftDate: Date,
  startTime: string
): Date | null {
  const trimmed = startTime.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const day = startOfDay(shiftDate);
  return parse(
    `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    "HH:mm",
    day
  );
}

export function getShiftEndDateTime(
  shiftDate: Date,
  startTime: string,
  endTime: string
): Date | null {
  const start = getShiftStartDateTime(shiftDate, startTime);
  const end = getShiftStartDateTime(shiftDate, endTime);
  if (!start || !end) return null;

  if (end <= start) {
    return addDays(end, 1);
  }
  return end;
}

export function checkEarlyClockIn(
  now: Date,
  shift: { date: Date; startTime: string } | null,
  bufferMins: number,
  blockUnscheduledPunch: boolean
): { ok: boolean; error?: string; minutesEarly?: number } {
  if (!shift) {
    if (blockUnscheduledPunch) {
      return {
        ok: false,
        error: "No scheduled shift today. Ask your manager before clocking in.",
      };
    }
    return { ok: true };
  }

  const shiftStart = getShiftStartDateTime(shift.date, shift.startTime);
  if (!shiftStart) return { ok: true };

  const minutesUntilStart = differenceInMinutes(shiftStart, now);
  if (minutesUntilStart <= bufferMins) {
    return { ok: true };
  }

  return {
    ok: false,
    minutesEarly: minutesUntilStart,
    error: `Too early to clock in. Your shift starts at ${shift.startTime} (${minutesUntilStart} min away). Early punch blocked to prevent riding the clock.`,
  };
}
