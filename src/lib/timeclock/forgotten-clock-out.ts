import { differenceInMinutes, format, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatShiftTime } from "@/lib/schedule";
import { getShiftEndDateTime } from "@/lib/timeclock/early-clock-in";

export type ForgottenClockOutWarning = {
  entryId: string;
  staffMemberId: string;
  staffName: string;
  staffRole: string;
  hourlyRate: number;
  shiftId: string | null;
  scheduledEnd: string;
  scheduledEndLabel: string;
  shiftLabel: string;
  clockInAt: string;
  minutesPastShiftEnd: number;
  phantomHours: number;
  phantomPay: number;
};

export async function getForgottenClockOutWarnings(
  locationId: string
): Promise<{ graceMins: number; warnings: ForgottenClockOutWarning[] }> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { forgottenClockOutGraceMins: true },
  });
  const graceMins = location?.forgottenClockOutGraceMins ?? 30;
  const now = new Date();

  const openEntries = await prisma.timeEntry.findMany({
    where: { locationId, clockOutAt: null },
    include: {
      staffMember: {
        select: { id: true, name: true, role: true, hourlyRate: true },
      },
      shift: {
        select: { id: true, date: true, startTime: true, endTime: true },
      },
    },
    orderBy: { clockInAt: "asc" },
  });

  if (openEntries.length === 0) {
    return { graceMins, warnings: [] };
  }

  const warnings: ForgottenClockOutWarning[] = [];

  for (const entry of openEntries) {
    let shift = entry.shift;

    if (!shift) {
      const clockInDay = startOfDay(entry.clockInAt);
      shift = await prisma.shift.findFirst({
        where: {
          locationId,
          staffMemberId: entry.staffMemberId,
          date: clockInDay,
        },
        orderBy: { endTime: "desc" },
        select: { id: true, date: true, startTime: true, endTime: true },
      });
    }

    if (!shift) {
      const today = startOfDay(now);
      shift = await prisma.shift.findFirst({
        where: {
          locationId,
          staffMemberId: entry.staffMemberId,
          date: today,
        },
        orderBy: { endTime: "desc" },
        select: { id: true, date: true, startTime: true, endTime: true },
      });
    }

    if (!shift) continue;

    const scheduledEnd = getShiftEndDateTime(shift.date, shift.startTime, shift.endTime);
    if (!scheduledEnd) continue;

    const minutesPast = differenceInMinutes(now, scheduledEnd);
    if (minutesPast < graceMins) continue;

    const phantomHours = Math.round((minutesPast / 60) * 100) / 100;
    const hourlyRate = entry.staffMember.hourlyRate ?? 0;

    warnings.push({
      entryId: entry.id,
      staffMemberId: entry.staffMemberId,
      staffName: entry.staffMember.name,
      staffRole: entry.staffMember.role,
      hourlyRate,
      shiftId: shift.id,
      scheduledEnd: scheduledEnd.toISOString(),
      scheduledEndLabel: format(scheduledEnd, "h:mm a"),
      shiftLabel: formatShiftTime(shift.startTime, shift.endTime),
      clockInAt: entry.clockInAt.toISOString(),
      minutesPastShiftEnd: minutesPast,
      phantomHours,
      phantomPay: Math.round(phantomHours * hourlyRate * 100) / 100,
    });
  }

  warnings.sort((a, b) => b.minutesPastShiftEnd - a.minutesPastShiftEnd);
  return { graceMins, warnings };
}

export function formatForgottenClockOutSummary(warnings: ForgottenClockOutWarning[]): string {
  if (warnings.length === 0) return "";
  if (warnings.length === 1) {
    const w = warnings[0];
    return `${w.staffName} is still clocked in ${w.minutesPastShiftEnd} min after scheduled end (${w.scheduledEndLabel}).`;
  }
  const totalPhantom = warnings.reduce((sum, w) => sum + w.phantomPay, 0);
  return `${warnings.length} employees still clocked in past shift end — up to $${totalPhantom.toFixed(2)} in phantom hours if not corrected before end-of-day reports.`;
}
