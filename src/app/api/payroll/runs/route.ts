import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { loadPayrollPreview } from "@/lib/payroll/load-context";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_payroll");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const runs = await prisma.payrollRun.findMany({
    where: { locationId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      payPeriod: true,
      lineItems: { include: { staffMember: { select: { id: true, name: true, role: true } } } },
    },
  });

  return NextResponse.json(runs);
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_payroll");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const periodStart = new Date(body.periodStart);
  const periodEnd = new Date(body.periodEnd);

  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    return NextResponse.json({ error: "Invalid period dates" }, { status: 400 });
  }

  const preview = await loadPayrollPreview(locationId, periodStart, periodEnd);

  const payPeriod = await prisma.payPeriod.create({
    data: {
      locationId,
      startDate: periodStart,
      endDate: periodEnd,
      status: "DRAFT",
    },
  });

  const pendingEwa = await prisma.ewaAdvance.groupBy({
    by: ["staffMemberId"],
    where: {
      locationId,
      status: { in: ["PENDING", "PAID"] },
      payPeriodId: null,
    },
    _sum: { amount: true, fee: true },
  });

  const ewaByStaff = new Map(
    pendingEwa.map((e) => [
      e.staffMemberId,
      (e._sum.amount ?? 0) + (e._sum.fee ?? 0),
    ])
  );

  const run = await prisma.payrollRun.create({
    data: {
      locationId,
      payPeriodId: payPeriod.id,
      status: "DRAFT",
      lineItems: {
        create: preview.employees
          .filter((e) => e.grossPay > 0)
          .map((e) => {
            const ewaDeductions = ewaByStaff.get(e.staffMemberId) ?? 0;
            return {
              staffMemberId: e.staffMemberId,
              regularHours: e.regularHours,
              overtimeHours: e.overtimeHours,
              splitShiftHours: e.splitShiftHours,
              regularPay: e.regularPay,
              overtimePay: e.overtimePay,
              splitShiftPay: e.splitShiftPay,
              holidayPay: e.holidayPay ?? 0,
              holidayPremiumPay: e.holidayPremiumPay ?? 0,
              tipsAllocated: e.tipsAllocated,
              tipCreditMakeup: e.tipCreditMakeup,
              grossPay: e.grossPay,
              ewaDeductions,
              netPay: Math.max(0, e.grossPay - ewaDeductions),
              rateBreakdown: JSON.stringify(e.rateSegments),
            };
          }),
      },
    },
    include: {
      lineItems: { include: { staffMember: { select: { id: true, name: true, role: true } } } },
      payPeriod: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREATE",
      entity: "payroll_run",
      entityId: run.id,
      details: `Payroll run draft: $${preview.totals.grossPay.toFixed(2)} gross`,
    },
  });

  const accruedRows = preview.employees.flatMap((e) =>
    (e.holidayDetails ?? [])
      .filter((d) => d.accruedDaysOff > 0 && d.eligible)
      .map((d) => ({
        locationId,
        staffMemberId: e.staffMemberId,
        holidayDate: new Date(`${d.holidayDate}T12:00:00.000Z`),
        daysAccrued: d.accruedDaysOff,
        reason: `Substitute day — ${d.holidayName}`,
      }))
  );
  if (accruedRows.length > 0) {
    await prisma.staffAccruedDayOff.createMany({ data: accruedRows });
  }

  return NextResponse.json(run);
}
