import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  computePayrollPreview,
  settingsFromDb,
  defaultPayrollSettings,
  parseTipPoolRoles,
} from "./compute";
import type { PayrollPreview } from "./types";
import {
  defaultHolidayPayRule,
  holidayRuleFromDb,
  type HolidayPayRuleInput,
} from "./holiday-pay";

export async function getOrCreatePayrollSettings(locationId: string) {
  let settings = await prisma.payrollSettings.findUnique({ where: { locationId } });
  if (!settings) {
    const defaults = defaultPayrollSettings();
    settings = await prisma.payrollSettings.create({
      data: {
        locationId,
        ...defaults,
        tipPoolRoles: null,
      },
    });
  }
  return settings;
}

export async function getOrCreateHolidayPayRule(locationId: string) {
  let rule = await prisma.holidayPayRule.findUnique({ where: { locationId } });
  if (!rule) {
    const defaults = defaultHolidayPayRule();
    rule = await prisma.holidayPayRule.create({
      data: {
        locationId,
        ...defaults,
      },
    });
  }
  return rule;
}

function mapShift(sh: {
  id: string;
  staffMemberId: string | null;
  date: Date;
  startTime: string;
  endTime: string;
  workRole: string | null;
}) {
  return {
    id: sh.id,
    staffMemberId: sh.staffMemberId!,
    date: sh.date,
    startTime: sh.startTime,
    endTime: sh.endTime,
    workRole: sh.workRole,
  };
}

export async function loadPayrollPreview(
  locationId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<PayrollPreview> {
  const [settingsRow, holidayRuleRow, staff, roleRates, shifts, orders, timeEntries] =
    await Promise.all([
      getOrCreatePayrollSettings(locationId),
      getOrCreateHolidayPayRule(locationId),
      prisma.staffMember.findMany({ where: { locationId } }),
      prisma.staffRoleRate.findMany({
        where: { staffMember: { locationId } },
      }),
      prisma.shift.findMany({
        where: {
          locationId,
          date: { gte: periodStart, lte: periodEnd },
        },
      }),
      prisma.order.findMany({
        where: {
          locationId,
          paidAt: { gte: periodStart, lte: periodEnd },
          status: { in: ["PAID", "SERVED"] },
        },
        include: { payments: true },
      }),
      prisma.timeEntry.findMany({
        where: {
          locationId,
          clockInAt: { gte: periodStart, lte: periodEnd },
          clockOutAt: { not: null },
        },
      }),
    ]);

  const settings = settingsFromDb(settingsRow);
  const holidayRule: HolidayPayRuleInput = holidayRuleFromDb(holidayRuleRow);

  const lookbackStart = subDays(
    periodStart,
    Math.max(holidayRule.lookbackDays, 365)
  );

  const [lookbackShifts, lookbackPunches, holidayFactors] = await Promise.all([
    prisma.shift.findMany({
      where: {
        locationId,
        date: { gte: lookbackStart, lte: periodEnd },
      },
    }),
    prisma.timeEntry.findMany({
      where: {
        locationId,
        clockInAt: { gte: lookbackStart, lte: periodEnd },
        clockOutAt: { not: null },
      },
    }),
    prisma.externalFactor.findMany({
      where: {
        locationId,
        factorType: "holiday",
        date: { gte: lookbackStart, lte: periodEnd },
      },
    }),
  ]);

  const tipOrders = orders.flatMap((order) => {
    const tips = order.payments.reduce((s, p) => s + p.tipAmount, 0);
    if (tips <= 0) return [];
    return [
      {
        serverStaffId: order.serverStaffId,
        tipAmount: tips,
        paidAt: order.paidAt,
      },
    ];
  });

  const delegatedToProvider =
    settings.embeddedPayrollProvider !== "NONE" &&
    settings.embeddedPayrollConnected;

  const holidays = holidayFactors.map((f) => ({
    date: f.date,
    name: f.description.replace(/^Holiday:\s*/, ""),
  }));

  return computePayrollPreview(
    staff.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      hourlyRate: s.hourlyRate,
      isTippedEmployee: s.isTippedEmployee,
      tipPoints: s.tipPoints,
      active: s.active,
    })),
    shifts
      .filter((sh): sh is typeof sh & { staffMemberId: string } => sh.staffMemberId != null)
      .map(mapShift),
    roleRates.map((r) => ({
      staffMemberId: r.staffMemberId,
      role: r.role,
      hourlyRate: r.hourlyRate,
      tipPoints: r.tipPoints,
      isTippedRole: r.isTippedRole,
    })),
    tipOrders,
    settings,
    periodStart,
    periodEnd,
    timeEntries.map((e) => ({
      id: e.id,
      staffMemberId: e.staffMemberId,
      clockInAt: e.clockInAt,
      clockOutAt: e.clockOutAt!,
      workRole: e.workRole,
      hourlyRateAtPunch: e.hourlyRateAtPunch,
    })),
    {
      rule: holidayRule,
      delegatedToProvider,
      provider:
        settings.embeddedPayrollProvider !== "NONE"
          ? settings.embeddedPayrollProvider
          : null,
      holidays,
      staffMeta: staff.map((s) => ({ id: s.id, hireDate: s.hireDate })),
      lookbackShifts: lookbackShifts
        .filter((sh): sh is typeof sh & { staffMemberId: string } => sh.staffMemberId != null)
        .map(mapShift),
      lookbackPunches: lookbackPunches.map((e) => ({
        id: e.id,
        staffMemberId: e.staffMemberId,
        clockInAt: e.clockInAt,
        clockOutAt: e.clockOutAt!,
        workRole: e.workRole,
        hourlyRateAtPunch: e.hourlyRateAtPunch,
      })),
    }
  );
}

export { parseTipPoolRoles };
