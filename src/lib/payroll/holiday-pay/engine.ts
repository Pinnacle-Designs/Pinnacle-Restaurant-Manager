import { differenceInCalendarDays, parseISO, subDays } from "date-fns";
import { shiftDurationHours } from "@/lib/schedule";
import type {
  RoleRateInput,
  ShiftInput,
  StaffInput,
  TimeEntryInput,
} from "../types";
import { getEffectiveRate } from "../rates";
import type {
  EmployeeHolidayPayResult,
  HolidayDateInput,
  HolidayPayDetail,
  HolidayPayRuleInput,
  HolidayPaySummary,
  StaffHolidayInput,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDate(d: Date | string): Date {
  return typeof d === "string" ? parseISO(d) : d;
}

function dateKey(d: Date | string): string {
  return toDate(d).toISOString().slice(0, 10);
}

function punchHours(entry: TimeEntryInput): number {
  if (!entry.clockOutAt) return 0;
  return (
    (toDate(entry.clockOutAt).getTime() - toDate(entry.clockInAt).getTime()) /
    (1000 * 60 * 60)
  );
}

function shiftWages(
  staff: StaffInput,
  shift: ShiftInput,
  roleRates: RoleRateInput[]
): number {
  const hours = shiftDurationHours(shift.startTime, shift.endTime);
  const { rate } = getEffectiveRate(staff, shift.workRole, roleRates);
  return hours * rate;
}

function punchWages(
  staff: StaffInput,
  entry: TimeEntryInput,
  roleRates: RoleRateInput[]
): number {
  const hours = punchHours(entry);
  const rate =
    entry.hourlyRateAtPunch ??
    getEffectiveRate(staff, entry.workRole, roleRates).rate;
  return hours * rate;
}

function workDaysInRange(
  staffMemberId: string,
  start: Date,
  end: Date,
  shifts: ShiftInput[],
  punches: TimeEntryInput[]
): Set<string> {
  const days = new Set<string>();
  for (const shift of shifts) {
    if (shift.staffMemberId !== staffMemberId) continue;
    const d = toDate(shift.date);
    if (d >= start && d < end) days.add(dateKey(d));
  }
  for (const punch of punches) {
    if (punch.staffMemberId !== staffMemberId || !punch.clockOutAt) continue;
    const d = toDate(punch.clockInAt);
    if (d >= start && d < end) days.add(dateKey(d));
  }
  return days;
}

function lookbackWages(
  staff: StaffInput,
  holidayDate: Date,
  lookbackDays: number,
  shifts: ShiftInput[],
  punches: TimeEntryInput[],
  roleRates: RoleRateInput[]
): { wages: number; daysWorked: number } {
  const end = holidayDate;
  const start = subDays(end, lookbackDays);
  let wages = 0;

  for (const shift of shifts) {
    if (shift.staffMemberId !== staff.id) continue;
    const d = toDate(shift.date);
    if (d >= start && d < end) wages += shiftWages(staff, shift, roleRates);
  }

  for (const punch of punches) {
    if (punch.staffMemberId !== staff.id || !punch.clockOutAt) continue;
    const d = toDate(punch.clockInAt);
    if (d >= start && d < end) wages += punchWages(staff, punch, roleRates);
  }

  const daysWorked = workDaysInRange(staff.id, start, end, shifts, punches).size;
  return { wages: round2(wages), daysWorked };
}

function hoursWorkedOnDate(
  staffMemberId: string,
  day: Date,
  shifts: ShiftInput[],
  punches: TimeEntryInput[]
): number {
  const key = dateKey(day);
  let hours = 0;

  for (const shift of shifts) {
    if (shift.staffMemberId !== staffMemberId) continue;
    if (dateKey(shift.date) === key) {
      hours += shiftDurationHours(shift.startTime, shift.endTime);
    }
  }

  const punchHoursForDay = punches
    .filter(
      (p) =>
        p.staffMemberId === staffMemberId &&
        p.clockOutAt &&
        dateKey(p.clockInAt) === key
    )
    .reduce((sum, p) => sum + punchHours(p), 0);

  return punchHoursForDay > 0 ? punchHoursForDay : hours;
}

function effectiveRateOnDate(
  staff: StaffInput,
  day: Date,
  shifts: ShiftInput[],
  punches: TimeEntryInput[],
  roleRates: RoleRateInput[]
): number {
  const key = dateKey(day);
  const dayPunches = punches.filter(
    (p) =>
      p.staffMemberId === staff.id &&
      p.clockOutAt &&
      dateKey(p.clockInAt) === key
  );
  if (dayPunches.length > 0) {
    const totalHours = dayPunches.reduce((s, p) => s + punchHours(p), 0);
    const totalPay = dayPunches.reduce(
      (s, p) => s + punchWages(staff, p, roleRates),
      0
    );
    return totalHours > 0 ? totalPay / totalHours : staff.hourlyRate;
  }

  const dayShifts = shifts.filter(
    (sh) => sh.staffMemberId === staff.id && dateKey(sh.date) === key
  );
  if (dayShifts.length > 0) {
    let totalHours = 0;
    let totalPay = 0;
    for (const sh of dayShifts) {
      const h = shiftDurationHours(sh.startTime, sh.endTime);
      totalHours += h;
      totalPay += shiftWages(staff, sh, roleRates);
    }
    return totalHours > 0 ? totalPay / totalHours : staff.hourlyRate;
  }

  return getEffectiveRate(staff, staff.role, roleRates).rate;
}

function passesTenure(
  staff: StaffHolidayInput,
  holidayDate: Date,
  tenureDaysRequired: number
): boolean {
  if (tenureDaysRequired <= 0) return true;
  if (!staff.hireDate) return false;
  const days = differenceInCalendarDays(holidayDate, toDate(staff.hireDate));
  return days >= tenureDaysRequired;
}

function passesFirstLastRule(
  staffMemberId: string,
  holidayDate: Date,
  shifts: ShiftInput[],
  punches: TimeEntryInput[]
): boolean {
  const workDays = new Set<string>();
  for (const shift of shifts) {
    if (shift.staffMemberId !== staffMemberId) continue;
    workDays.add(dateKey(shift.date));
  }
  for (const punch of punches) {
    if (punch.staffMemberId !== staffMemberId || !punch.clockOutAt) continue;
    workDays.add(dateKey(punch.clockInAt));
  }

  const sorted = [...workDays].sort();
  const holidayKey = dateKey(holidayDate);
  const idx = sorted.indexOf(holidayKey);

  const hasBefore = sorted.some((d) => d < holidayKey);
  const hasAfter = sorted.some((d) => d > holidayKey);

  if (idx >= 0) {
    return (
      sorted.slice(0, idx).length > 0 && sorted.slice(idx + 1).length > 0
    );
  }

  return hasBefore && hasAfter;
}

function statutoryDailyPay(
  rule: HolidayPayRuleInput,
  lookback: { wages: number; daysWorked: number },
  holidaysInPeriod: number
): number {
  if (lookback.wages <= 0) return 0;

  switch (rule.denominatorMode) {
    case "FIXED_DIVISOR": {
      const divisor = Math.max(1, rule.fixedDivisor);
      return round2(lookback.wages / divisor);
    }
    case "DAYS_WORKED": {
      const divisor = Math.max(1, lookback.daysWorked);
      return round2(lookback.wages / divisor);
    }
    case "ANNUAL_PERCENTAGE": {
      const pct = rule.annualPercentage ?? 4;
      const annualized = lookback.wages * (365 / Math.max(1, rule.lookbackDays));
      const holidayCount = Math.max(1, holidaysInPeriod);
      return round2((annualized * (pct / 100)) / holidayCount);
    }
    default:
      return 0;
  }
}

function evaluateEmployeeHoliday(
  staff: StaffInput,
  staffMeta: StaffHolidayInput,
  rule: HolidayPayRuleInput,
  holidays: HolidayDateInput[],
  shifts: ShiftInput[],
  punches: TimeEntryInput[],
  roleRates: RoleRateInput[]
): EmployeeHolidayPayResult {
  const details: HolidayPayDetail[] = [];
  let statutoryPay = 0;
  let premiumPay = 0;
  let accruedDaysOff = 0;

  for (const holiday of holidays) {
    const holidayDate = toDate(holiday.date);
    const detail: HolidayPayDetail = {
      holidayDate: dateKey(holidayDate),
      holidayName: holiday.name,
      eligible: true,
      hoursWorked: 0,
      statutoryPay: 0,
      premiumPay: 0,
      accruedDaysOff: 0,
    };

    if (!passesTenure(staffMeta, holidayDate, rule.tenureDaysRequired)) {
      detail.eligible = false;
      detail.ineligibleReason = `Tenure under ${rule.tenureDaysRequired} days`;
      details.push(detail);
      continue;
    }

    if (
      rule.requireFirstLastShift &&
      !passesFirstLastRule(staff.id, holidayDate, shifts, punches)
    ) {
      detail.eligible = false;
      detail.ineligibleReason = "First/last scheduled shift rule not met";
      details.push(detail);
      continue;
    }

    const hoursWorked = hoursWorkedOnDate(staff.id, holidayDate, shifts, punches);
    detail.hoursWorked = round2(hoursWorked);

    const lookback = lookbackWages(
      staff,
      holidayDate,
      rule.lookbackDays,
      shifts,
      punches,
      roleRates
    );

    if (rule.payStatutoryWhenOff) {
      const daily = statutoryDailyPay(rule, lookback, holidays.length);
      detail.statutoryPay = daily;
      statutoryPay += daily;
    }

    if (hoursWorked > 0) {
      const rate = effectiveRateOnDate(
        staff,
        holidayDate,
        shifts,
        punches,
        roleRates
      );

      if (rule.substituteDayEnabled) {
        detail.accruedDaysOff = 1;
        accruedDaysOff += 1;
        const extra =
          hoursWorked * rate * Math.max(0, rule.substituteDayMultiplier - 1);
        if (extra > 0) {
          detail.premiumPay = round2(extra);
          premiumPay += detail.premiumPay;
        }
      } else {
        const multiplier = rule.holidayPremiumMultiplier;
        const extra = hoursWorked * rate * Math.max(0, multiplier - 1);
        detail.premiumPay = round2(extra);
        premiumPay += detail.premiumPay;
      }
    }

    details.push(detail);
  }

  return {
    staffMemberId: staff.id,
    statutoryPay: round2(statutoryPay),
    premiumPay: round2(premiumPay),
    totalHolidayPay: round2(statutoryPay + premiumPay),
    accruedDaysOff,
    details,
  };
}

export interface ComputeHolidayPayOptions {
  rule: HolidayPayRuleInput;
  delegatedToProvider: boolean;
  provider: string | null;
  staff: StaffInput[];
  staffMeta: StaffHolidayInput[];
  holidays: HolidayDateInput[];
  shifts: ShiftInput[];
  punches: TimeEntryInput[];
  roleRates: RoleRateInput[];
  periodStart: Date;
  periodEnd: Date;
}

export function computeHolidayPay(
  options: ComputeHolidayPayOptions
): HolidayPaySummary {
  const {
    rule,
    delegatedToProvider,
    provider,
    staff,
    staffMeta,
    holidays,
    shifts,
    punches,
    roleRates,
    periodStart,
    periodEnd,
  } = options;

  const empty: HolidayPaySummary = {
    enabled: rule.enabled,
    delegatedToProvider,
    provider,
    employees: [],
    totals: {
      statutoryPay: 0,
      premiumPay: 0,
      holidayPay: 0,
      accruedDaysOff: 0,
    },
  };

  if (!rule.enabled || delegatedToProvider) {
    return { ...empty, delegatedToProvider: delegatedToProvider || false };
  }

  const periodHolidays = holidays.filter((h) => {
    const d = toDate(h.date);
    return d >= periodStart && d <= periodEnd;
  });

  if (periodHolidays.length === 0) return empty;

  const employees = staff
    .filter((s) => s.active)
    .map((member) => {
      const meta = staffMeta.find((m) => m.id === member.id) ?? {
        id: member.id,
        hireDate: null,
      };
      return evaluateEmployeeHoliday(
        member,
        meta,
        rule,
        periodHolidays,
        shifts,
        punches,
        roleRates
      );
    });

  return {
    enabled: true,
    delegatedToProvider: false,
    provider: null,
    employees,
    totals: {
      statutoryPay: round2(
        employees.reduce((s, e) => s + e.statutoryPay, 0)
      ),
      premiumPay: round2(employees.reduce((s, e) => s + e.premiumPay, 0)),
      holidayPay: round2(employees.reduce((s, e) => s + e.totalHolidayPay, 0)),
      accruedDaysOff: employees.reduce((s, e) => s + e.accruedDaysOff, 0),
    },
  };
}
