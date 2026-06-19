import type { TipPoolMode } from "@prisma/client";
import { parseISO, startOfWeek, endOfWeek, differenceInMinutes } from "date-fns";
import { shiftDurationHours, parseTimeToMinutes, WEEK_STARTS_ON } from "@/lib/schedule";
import type {
  PayrollSettingsInput,
  ShiftInput,
  TimeEntryInput,
  StaffInput,
  RoleRateInput,
  EmployeePayPreview,
  TipAllocationPreview,
  PayrollPreview,
  ShiftPayDetail,
  RateSegment,
  EwaAvailability,
} from "./types";
import { getEffectiveRate } from "./rates";
import {
  computeHolidayPay,
  type HolidayPayRuleInput,
  type HolidayDateInput,
  type StaffHolidayInput,
} from "./holiday-pay";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDate(d: Date | string): Date {
  return typeof d === "string" ? parseISO(d) : d;
}

function dateKey(d: Date | string): string {
  const dt = toDate(d);
  return dt.toISOString().slice(0, 10);
}

export { getEffectiveRate } from "./rates";

/** Detect shifts eligible for split-shift premium on the same calendar day. */
export function detectSplitShiftPremiums(
  shifts: ShiftInput[],
  settings: PayrollSettingsInput
): Map<string, number> {
  const premiums = new Map<string, number>();
  if (!settings.splitShiftEnabled) return premiums;

  const byStaffDay = new Map<string, ShiftInput[]>();
  for (const shift of shifts) {
    const key = `${shift.staffMemberId}:${dateKey(shift.date)}`;
    const list = byStaffDay.get(key) ?? [];
    list.push(shift);
    byStaffDay.set(key, list);
  }

  for (const dayShifts of byStaffDay.values()) {
    if (dayShifts.length < 2) continue;
    const sorted = [...dayShifts].sort(
      (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
    );
    let hasSplit = false;
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = parseTimeToMinutes(sorted[i - 1].endTime);
      const nextStart = parseTimeToMinutes(sorted[i].startTime);
      let gap = nextStart - prevEnd;
      if (gap < 0) gap += 24 * 60;
      if (gap >= settings.splitShiftMinGapMinutes) {
        hasSplit = true;
        break;
      }
    }
    if (hasSplit) {
      const premium = settings.splitShiftPremiumHours * settings.minimumWage;
      for (const s of sorted) {
        premiums.set(s.id, premium / sorted.length);
      }
    }
  }
  return premiums;
}

function punchDurationHours(clockIn: Date | string, clockOut: Date | string): number {
  return differenceInMinutes(toDate(clockOut), toDate(clockIn)) / 60;
}

/** Split-shift premium when an employee punches out and back in same day (actual punches). */
export function detectSplitShiftPremiumsFromPunches(
  entries: TimeEntryInput[],
  settings: PayrollSettingsInput
): Map<string, number> {
  const premiums = new Map<string, number>();
  if (!settings.splitShiftEnabled) return premiums;

  const closed = entries.filter((e) => e.clockOutAt);
  const byStaffDay = new Map<string, TimeEntryInput[]>();
  for (const entry of closed) {
    const key = `${entry.staffMemberId}:${dateKey(entry.clockInAt)}`;
    const list = byStaffDay.get(key) ?? [];
    list.push(entry);
    byStaffDay.set(key, list);
  }

  for (const dayEntries of byStaffDay.values()) {
    if (dayEntries.length < 2) continue;
    const sorted = [...dayEntries].sort(
      (a, b) => toDate(a.clockInAt).getTime() - toDate(b.clockInAt).getTime()
    );
    let hasSplit = false;
    for (let i = 1; i < sorted.length; i++) {
      const gap = differenceInMinutes(
        toDate(sorted[i].clockInAt),
        toDate(sorted[i - 1].clockOutAt!)
      );
      if (gap >= settings.splitShiftMinGapMinutes) {
        hasSplit = true;
        break;
      }
    }
    if (hasSplit) {
      const premium = settings.splitShiftPremiumHours * settings.minimumWage;
      for (const entry of sorted) {
        premiums.set(entry.id, premium / sorted.length);
      }
    }
  }
  return premiums;
}

function buildWeekHoursFromPunches(
  staff: StaffInput,
  punches: TimeEntryInput[],
  roleRates: RoleRateInput[],
  splitPremiums: Map<string, number>
): WeekHours {
  const segmentMap = new Map<string, RateSegment>();
  const shiftDetails: ShiftPayDetail[] = [];
  let splitShiftPay = 0;

  for (const punch of punches) {
    if (!punch.clockOutAt) continue;
    const hours = punchDurationHours(punch.clockInAt, punch.clockOutAt);
    if (hours <= 0) continue;

    const role = punch.workRole || staff.role;
    const rate =
      punch.hourlyRateAtPunch ??
      getEffectiveRate(staff, punch.workRole, roleRates).rate;
    const premium = splitPremiums.get(punch.id) ?? 0;
    splitShiftPay += premium;

    const seg = segmentMap.get(`${role}:${rate}`) ?? { role, hours: 0, rate };
    seg.hours += hours;
    segmentMap.set(`${role}:${rate}`, seg);

    shiftDetails.push({
      shiftId: punch.id,
      punchId: punch.id,
      role,
      hours,
      rate,
      regularPay: round2(hours * rate),
      splitShiftPremium: round2(premium),
    });
  }

  const segments = [...segmentMap.values()];
  const totalHours = segments.reduce((s, seg) => s + seg.hours, 0);
  return { totalHours, segments, shiftDetails, splitShiftPay: round2(splitShiftPay) };
}

function computeEmployeeWeekPayFromPunches(
  staff: StaffInput,
  weekPunches: TimeEntryInput[],
  roleRates: RoleRateInput[],
  settings: PayrollSettingsInput,
  splitPremiums: Map<string, number>
): Pick<
  EmployeePayPreview,
  | "regularHours"
  | "overtimeHours"
  | "splitShiftHours"
  | "regularPay"
  | "overtimePay"
  | "splitShiftPay"
  | "blendedRate"
  | "rateSegments"
  | "shiftDetails"
> {
  const { totalHours, segments, shiftDetails, splitShiftPay } = buildWeekHoursFromPunches(
    staff,
    weekPunches,
    roleRates,
    splitPremiums
  );

  if (totalHours <= 0) {
    return {
      regularHours: 0,
      overtimeHours: 0,
      splitShiftHours: 0,
      regularPay: 0,
      overtimePay: 0,
      splitShiftPay: 0,
      blendedRate: 0,
      rateSegments: [],
      shiftDetails: [],
    };
  }

  let otHours = Math.max(0, totalHours - settings.weeklyOtThresholdHours);

  if (settings.dailyOtThresholdHours != null) {
    const byDay = new Map<string, number>();
    for (const punch of weekPunches) {
      if (!punch.clockOutAt) continue;
      const h = punchDurationHours(punch.clockInAt, punch.clockOutAt);
      const key = dateKey(punch.clockInAt);
      byDay.set(key, (byDay.get(key) ?? 0) + h);
    }
    let dailyOt = 0;
    for (const dayHours of byDay.values()) {
      dailyOt += Math.max(0, dayHours - settings.dailyOtThresholdHours);
    }
    otHours = Math.max(otHours, dailyOt);
  }

  otHours = Math.min(otHours, totalHours);
  const regularHours = totalHours - otHours;

  let regularPay = 0;
  let overtimePay = 0;

  if (settings.useBlendedOtRate) {
    const blended = computeBlendedRate(segments);
    regularPay = round2(regularHours * blended);
    overtimePay = round2(otHours * blended * settings.otMultiplier);
    return {
      regularHours: round2(regularHours),
      overtimeHours: round2(otHours),
      splitShiftHours: settings.splitShiftEnabled ? settings.splitShiftPremiumHours : 0,
      regularPay,
      overtimePay,
      splitShiftPay,
      blendedRate: round2(blended),
      rateSegments: segments.map((s) => ({ ...s, hours: round2(s.hours) })),
      shiftDetails,
    };
  }

  for (const seg of segments) {
    const segOt = Math.min(seg.hours, otHours * (seg.hours / totalHours));
    const segRegular = seg.hours - segOt;
    regularPay += segRegular * seg.rate;
    overtimePay += segOt * seg.rate * settings.otMultiplier;
  }

  const blended = computeBlendedRate(segments);
  return {
    regularHours: round2(regularHours),
    overtimeHours: round2(otHours),
    splitShiftHours: settings.splitShiftEnabled ? settings.splitShiftPremiumHours : 0,
    regularPay: round2(regularPay),
    overtimePay: round2(overtimePay),
    splitShiftPay,
    blendedRate: round2(blended),
    rateSegments: segments.map((s) => ({ ...s, hours: round2(s.hours) })),
    shiftDetails,
  };
}

interface WeekHours {
  totalHours: number;
  segments: RateSegment[];
  shiftDetails: ShiftPayDetail[];
  splitShiftPay: number;
}

function buildWeekHours(
  staff: StaffInput,
  weekShifts: ShiftInput[],
  roleRates: RoleRateInput[],
  splitPremiums: Map<string, number>
): WeekHours {
  const segmentMap = new Map<string, RateSegment>();
  const shiftDetails: ShiftPayDetail[] = [];
  let splitShiftPay = 0;

  for (const shift of weekShifts) {
    const hours = shiftDurationHours(shift.startTime, shift.endTime);
    const { role, rate } = getEffectiveRate(staff, shift.workRole, roleRates);
    const premium = splitPremiums.get(shift.id) ?? 0;
    splitShiftPay += premium;

    const seg = segmentMap.get(`${role}:${rate}`) ?? { role, hours: 0, rate };
    seg.hours += hours;
    segmentMap.set(`${role}:${rate}`, seg);

    shiftDetails.push({
      shiftId: shift.id,
      role,
      hours,
      rate,
      regularPay: round2(hours * rate),
      splitShiftPremium: round2(premium),
    });
  }

  const segments = [...segmentMap.values()];
  const totalHours = segments.reduce((s, seg) => s + seg.hours, 0);
  return { totalHours, segments, shiftDetails, splitShiftPay: round2(splitShiftPay) };
}

function computeBlendedRate(segments: RateSegment[]): number {
  const totalHours = segments.reduce((s, seg) => s + seg.hours, 0);
  if (totalHours <= 0) return 0;
  const totalPay = segments.reduce((s, seg) => s + seg.hours * seg.rate, 0);
  return totalPay / totalHours;
}

function computeEmployeeWeekPay(
  staff: StaffInput,
  weekShifts: ShiftInput[],
  roleRates: RoleRateInput[],
  settings: PayrollSettingsInput,
  splitPremiums: Map<string, number>
): Pick<
  EmployeePayPreview,
  | "regularHours"
  | "overtimeHours"
  | "splitShiftHours"
  | "regularPay"
  | "overtimePay"
  | "splitShiftPay"
  | "blendedRate"
  | "rateSegments"
  | "shiftDetails"
> {
  const { totalHours, segments, shiftDetails, splitShiftPay } = buildWeekHours(
    staff,
    weekShifts,
    roleRates,
    splitPremiums
  );

  if (totalHours <= 0) {
    return {
      regularHours: 0,
      overtimeHours: 0,
      splitShiftHours: 0,
      regularPay: 0,
      overtimePay: 0,
      splitShiftPay: 0,
      blendedRate: 0,
      rateSegments: [],
      shiftDetails: [],
    };
  }

  let otHours = Math.max(0, totalHours - settings.weeklyOtThresholdHours);

  if (settings.dailyOtThresholdHours != null) {
    const byDay = new Map<string, number>();
    for (const shift of weekShifts) {
      const h = shiftDurationHours(shift.startTime, shift.endTime);
      const key = dateKey(shift.date);
      byDay.set(key, (byDay.get(key) ?? 0) + h);
    }
    let dailyOt = 0;
    for (const dayHours of byDay.values()) {
      dailyOt += Math.max(0, dayHours - settings.dailyOtThresholdHours);
    }
    otHours = Math.max(otHours, dailyOt);
  }

  otHours = Math.min(otHours, totalHours);
  const regularHours = totalHours - otHours;

  let regularPay = 0;
  let overtimePay = 0;

  if (settings.useBlendedOtRate) {
    const blended = computeBlendedRate(segments);
    regularPay = round2(regularHours * blended);
    const otRate = blended * settings.otMultiplier;
    overtimePay = round2(otHours * otRate);
    return {
      regularHours: round2(regularHours),
      overtimeHours: round2(otHours),
      splitShiftHours: settings.splitShiftEnabled ? settings.splitShiftPremiumHours : 0,
      regularPay,
      overtimePay,
      splitShiftPay,
      blendedRate: round2(blended),
      rateSegments: segments.map((s) => ({ ...s, hours: round2(s.hours) })),
      shiftDetails,
    };
  }

  for (const seg of segments) {
    const segOt = Math.min(seg.hours, otHours * (seg.hours / totalHours));
    const segRegular = seg.hours - segOt;
    regularPay += segRegular * seg.rate;
    overtimePay += segOt * seg.rate * settings.otMultiplier;
  }

  const blended = computeBlendedRate(segments);
  return {
    regularHours: round2(regularHours),
    overtimeHours: round2(otHours),
    splitShiftHours: settings.splitShiftEnabled ? settings.splitShiftPremiumHours : 0,
    regularPay: round2(regularPay),
    overtimePay: round2(overtimePay),
    splitShiftPay,
    blendedRate: round2(blended),
    rateSegments: segments.map((s) => ({ ...s, hours: round2(s.hours) })),
    shiftDetails,
  };
}

export function computeTipCreditMakeup(
  staff: StaffInput,
  cashWageHours: number,
  cashWageRate: number,
  tipsReceived: number,
  settings: PayrollSettingsInput
): number {
  if (!staff.isTippedEmployee || cashWageHours <= 0) return 0;
  const effectiveHourly = (cashWageRate * cashWageHours + tipsReceived) / cashWageHours;
  if (effectiveHourly >= settings.minimumWage) return 0;
  const shortfall = settings.minimumWage - effectiveHourly;
  return round2(shortfall * cashWageHours);
}

export interface TipOrderInput {
  serverStaffId: string | null;
  tipAmount: number;
  paidAt: Date | null;
}

export function allocateTips(
  staff: StaffInput[],
  shifts: ShiftInput[],
  roleRates: RoleRateInput[],
  orders: TipOrderInput[],
  settings: PayrollSettingsInput,
  periodStart: Date,
  periodEnd: Date,
  timeEntries: TimeEntryInput[] = []
): { totalTips: number; allocations: TipAllocationPreview[] } {
  const inPeriod = orders.filter(
    (o) => o.paidAt && o.paidAt >= periodStart && o.paidAt <= periodEnd
  );
  const totalTips = round2(inPeriod.reduce((s, o) => s + o.tipAmount, 0));

  const poolRoles = settings.tipPoolRoles?.length
    ? new Set(settings.tipPoolRoles)
    : null;

  const activeStaff = staff.filter((s) => s.active);
  const periodShifts = shifts.filter((sh) => {
    const d = toDate(sh.date);
    return d >= periodStart && d <= periodEnd;
  });

  function hoursFor(member: StaffInput): number {
    const punches = timeEntries.filter(
      (e) => e.staffMemberId === member.id && e.clockOutAt
    );
    if (punches.length > 0) {
      return punches.reduce(
        (s, e) => s + punchDurationHours(e.clockInAt, e.clockOutAt!),
        0
      );
    }
    return periodShifts
      .filter((sh) => sh.staffMemberId === member.id)
      .reduce((s, sh) => s + shiftDurationHours(sh.startTime, sh.endTime), 0);
  }

  function inPool(member: StaffInput): boolean {
    if (!poolRoles) return true;
    return poolRoles.has(member.role);
  }

  function tipPointsFor(member: StaffInput): number {
    const hours = hoursFor(member);
    const { tipPoints } = getEffectiveRate(member, member.role, roleRates);
    return hours * tipPoints;
  }

  const allocations: TipAllocationPreview[] = [];

  if (settings.tipPoolMode === "INDIVIDUAL") {
    const byServer = new Map<string, number>();
    for (const order of inPeriod) {
      if (!order.serverStaffId) continue;
      byServer.set(
        order.serverStaffId,
        (byServer.get(order.serverStaffId) ?? 0) + order.tipAmount
      );
    }
    for (const member of activeStaff) {
      const tipsAmount = round2(byServer.get(member.id) ?? 0);
      const hours = hoursFor(member);
      const { rate, isTipped } = getEffectiveRate(member, member.role, roleRates);
      const cashRate = isTipped ? settings.tippedMinCashWage : rate;
      const makeup = computeTipCreditMakeup(member, hours, cashRate, tipsAmount, settings);
      allocations.push({
        staffMemberId: member.id,
        name: member.name,
        hoursWorked: round2(hours),
        tipPoints: member.tipPoints,
        sharePercent: totalTips > 0 ? round2((tipsAmount / totalTips) * 100) : 0,
        tipsAmount,
        tipCreditMakeup: makeup,
      });
    }
    return { totalTips, allocations };
  }

  const poolMembers = activeStaff.filter(inPool);
  let denominator = 0;

  if (settings.tipPoolMode === "FULL_POOL") {
    denominator = poolMembers.reduce((s, m) => s + hoursFor(m), 0);
  } else {
    denominator = poolMembers.reduce((s, m) => s + tipPointsFor(m), 0);
  }

  for (const member of activeStaff) {
    const hours = hoursFor(member);
    let share = 0;
    if (poolMembers.includes(member) && denominator > 0) {
      const weight =
        settings.tipPoolMode === "FULL_POOL" ? hours : tipPointsFor(member);
      share = (weight / denominator) * totalTips;
    }
    const tipsAmount = round2(share);
    const { rate, isTipped } = getEffectiveRate(member, member.role, roleRates);
    const cashRate = isTipped ? settings.tippedMinCashWage : rate;
    const makeup = computeTipCreditMakeup(member, hours, cashRate, tipsAmount, settings);
    allocations.push({
      staffMemberId: member.id,
      name: member.name,
      hoursWorked: round2(hours),
      tipPoints: member.tipPoints,
      sharePercent: totalTips > 0 ? round2((tipsAmount / totalTips) * 100) : 0,
      tipsAmount,
      tipCreditMakeup: makeup,
    });
  }

  return { totalTips, allocations };
}

export function computePayrollPreview(
  staff: StaffInput[],
  shifts: ShiftInput[],
  roleRates: RoleRateInput[],
  orders: TipOrderInput[],
  settings: PayrollSettingsInput,
  periodStart: Date,
  periodEnd: Date,
  timeEntries: TimeEntryInput[] = [],
  holidayContext?: {
    rule: HolidayPayRuleInput;
    delegatedToProvider: boolean;
    provider: string | null;
    holidays: HolidayDateInput[];
    staffMeta: StaffHolidayInput[];
    lookbackShifts: ShiftInput[];
    lookbackPunches: TimeEntryInput[];
  }
): PayrollPreview {
  const periodShifts = shifts.filter((sh) => {
    const d = toDate(sh.date);
    return d >= periodStart && d <= periodEnd;
  });

  const periodPunches = timeEntries.filter((e) => {
    const d = toDate(e.clockInAt);
    return d >= periodStart && d <= periodEnd && e.clockOutAt;
  });

  const splitPremiumsFromShifts = detectSplitShiftPremiums(periodShifts, settings);
  const splitPremiumsFromPunches = detectSplitShiftPremiumsFromPunches(periodPunches, settings);

  const { totalTips, allocations: tipAllocations } = allocateTips(
    staff,
    shifts,
    roleRates,
    orders,
    settings,
    periodStart,
    periodEnd,
    timeEntries
  );

  const tipByStaff = new Map(tipAllocations.map((a) => [a.staffMemberId, a]));

  const employees: EmployeePayPreview[] = [];
  const activeStaff = staff.filter((s) => s.active);

  for (const member of activeStaff) {
    const memberPunches = periodPunches.filter((e) => e.staffMemberId === member.id);
    const memberShifts = periodShifts.filter((sh) => sh.staffMemberId === member.id);
    const usePunches = memberPunches.length > 0;

    const weeks = new Map<string, ShiftInput[] | TimeEntryInput[]>();
    if (usePunches) {
      for (const punch of memberPunches) {
        const wk = startOfWeek(toDate(punch.clockInAt), { weekStartsOn: WEEK_STARTS_ON }).toISOString();
        const list = (weeks.get(wk) ?? []) as TimeEntryInput[];
        list.push(punch);
        weeks.set(wk, list);
      }
    } else {
      for (const sh of memberShifts) {
        const wk = startOfWeek(toDate(sh.date), { weekStartsOn: WEEK_STARTS_ON }).toISOString();
        const list = (weeks.get(wk) ?? []) as ShiftInput[];
        list.push(sh);
        weeks.set(wk, list);
      }
    }

    let regularHours = 0;
    let overtimeHours = 0;
    let regularPay = 0;
    let overtimePay = 0;
    let splitShiftPay = 0;
    let blendedRate = 0;
    const rateSegments: RateSegment[] = [];
    const shiftDetails: ShiftPayDetail[] = [];

    for (const weekItems of weeks.values()) {
      const weekPay = usePunches
        ? computeEmployeeWeekPayFromPunches(
            member,
            weekItems as TimeEntryInput[],
            roleRates,
            settings,
            splitPremiumsFromPunches
          )
        : computeEmployeeWeekPay(
            member,
            weekItems as ShiftInput[],
            roleRates,
            settings,
            splitPremiumsFromShifts
          );
      regularHours += weekPay.regularHours;
      overtimeHours += weekPay.overtimeHours;
      regularPay += weekPay.regularPay;
      overtimePay += weekPay.overtimePay;
      splitShiftPay += weekPay.splitShiftPay;
      blendedRate = weekPay.blendedRate;
      rateSegments.push(...weekPay.rateSegments);
      shiftDetails.push(...weekPay.shiftDetails);
    }

    const tipInfo = tipByStaff.get(member.id);
    const tipsAllocated = tipInfo?.tipsAmount ?? 0;
    const tipCreditMakeup = tipInfo?.tipCreditMakeup ?? 0;
    const grossPay = round2(
      regularPay + overtimePay + splitShiftPay + tipsAllocated + tipCreditMakeup
    );

    employees.push({
      staffMemberId: member.id,
      name: member.name,
      regularHours: round2(regularHours),
      overtimeHours: round2(overtimeHours),
      splitShiftHours: settings.splitShiftEnabled ? settings.splitShiftPremiumHours : 0,
      regularPay: round2(regularPay),
      overtimePay: round2(overtimePay),
      splitShiftPay: round2(splitShiftPay),
      statutoryHolidayPay: 0,
      holidayPremiumPay: 0,
      holidayPay: 0,
      accruedDaysOff: 0,
      tipsAllocated,
      tipCreditMakeup,
      grossPay,
      blendedRate,
      rateSegments,
      shiftDetails,
    });
  }

  const holidaySummary = holidayContext
    ? computeHolidayPay({
        rule: holidayContext.rule,
        delegatedToProvider: holidayContext.delegatedToProvider,
        provider: holidayContext.provider,
        staff,
        staffMeta: holidayContext.staffMeta,
        holidays: holidayContext.holidays,
        shifts: holidayContext.lookbackShifts,
        punches: holidayContext.lookbackPunches,
        roleRates,
        periodStart,
        periodEnd,
      })
    : undefined;

  if (holidaySummary?.enabled && !holidaySummary.delegatedToProvider) {
    for (const employee of employees) {
      const holiday = holidaySummary.employees.find(
        (h) => h.staffMemberId === employee.staffMemberId
      );
      if (!holiday) continue;
      employee.statutoryHolidayPay = holiday.statutoryPay;
      employee.holidayPremiumPay = holiday.premiumPay;
      employee.holidayPay = holiday.totalHolidayPay;
      employee.accruedDaysOff = holiday.accruedDaysOff;
      employee.holidayDetails = holiday.details;
      employee.grossPay = round2(employee.grossPay + holiday.totalHolidayPay);
    }
  }

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalTips,
    tipPoolMode: settings.tipPoolMode,
    employees,
    tipAllocations,
    holidayPay: holidaySummary,
    totals: {
      grossPay: round2(employees.reduce((s, e) => s + e.grossPay, 0)),
      tips: totalTips,
      tipCreditMakeup: round2(employees.reduce((s, e) => s + e.tipCreditMakeup, 0)),
      overtimePay: round2(employees.reduce((s, e) => s + e.overtimePay, 0)),
      splitShiftPay: round2(employees.reduce((s, e) => s + e.splitShiftPay, 0)),
      holidayPay: round2(employees.reduce((s, e) => s + e.holidayPay, 0)),
      statutoryHolidayPay: round2(
        employees.reduce((s, e) => s + e.statutoryHolidayPay, 0)
      ),
      holidayPremiumPay: round2(
        employees.reduce((s, e) => s + e.holidayPremiumPay, 0)
      ),
    },
  };
}

export function computeEwaAvailability(
  staffMemberId: string,
  preview: PayrollPreview,
  settings: PayrollSettingsInput,
  pendingAdvances: number,
  deductedAdvances: number
): EwaAvailability {
  const employee = preview.employees.find((e) => e.staffMemberId === staffMemberId);
  const earnedToDate = employee?.grossPay ?? 0;
  const maxEarned = earnedToDate * (settings.ewaMaxPercent / 100);
  const availableAmount = round2(
    Math.max(0, Math.min(maxEarned - pendingAdvances, settings.ewaMaxPerAdvance))
  );

  return {
    staffMemberId,
    earnedToDate: round2(earnedToDate),
    advancesPending: round2(pendingAdvances),
    advancesDeducted: round2(deductedAdvances),
    availableAmount,
    maxPercent: settings.ewaMaxPercent,
    maxPerAdvance: settings.ewaMaxPerAdvance,
  };
}

export function defaultPayrollSettings(): PayrollSettingsInput {
  return {
    minimumWage: 7.25,
    tipCredit: 5.12,
    tippedMinCashWage: 2.13,
    weeklyOtThresholdHours: 40,
    dailyOtThresholdHours: null,
    otMultiplier: 1.5,
    useBlendedOtRate: true,
    splitShiftEnabled: false,
    splitShiftPremiumHours: 1,
    splitShiftMinGapMinutes: 60,
    tipPoolMode: "INDIVIDUAL",
    tipPoolRoles: null,
    ewaEnabled: false,
    ewaMaxPercent: 50,
    ewaMaxPerAdvance: 200,
    ewaFeeFlat: 0,
    payPeriodDays: 14,
    embeddedPayrollProvider: "NONE",
    embeddedPayrollConnected: false,
  };
}

export function parseTipPoolRoles(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r === "string") : null;
  } catch {
    return null;
  }
}

export function serializeTipPoolRoles(roles: string[] | null): string | null {
  return roles?.length ? JSON.stringify(roles) : null;
}

export function settingsFromDb(row: {
  minimumWage: number;
  tipCredit: number;
  tippedMinCashWage: number;
  weeklyOtThresholdHours: number;
  dailyOtThresholdHours: number | null;
  otMultiplier: number;
  useBlendedOtRate: boolean;
  splitShiftEnabled: boolean;
  splitShiftPremiumHours: number;
  splitShiftMinGapMinutes: number;
  tipPoolMode: TipPoolMode;
  tipPoolRoles: string | null;
  ewaEnabled: boolean;
  ewaMaxPercent: number;
  ewaMaxPerAdvance: number;
  ewaFeeFlat: number;
  payPeriodDays: number;
  embeddedPayrollProvider?: "NONE" | "GUSTO" | "WAGEPOINT" | "PAPAYA_GLOBAL";
  embeddedPayrollConnected?: boolean;
}): PayrollSettingsInput {
  return {
    ...row,
    tipPoolRoles: parseTipPoolRoles(row.tipPoolRoles),
    embeddedPayrollProvider: row.embeddedPayrollProvider ?? "NONE",
    embeddedPayrollConnected: row.embeddedPayrollConnected ?? false,
  };
}

export function getDefaultPayPeriod(end: Date = new Date(), days = 14): {
  start: Date;
  end: Date;
} {
  const endDate = endOfWeek(end, { weekStartsOn: WEEK_STARTS_ON });
  const start = new Date(endDate);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  return { start, end: endDate };
}
