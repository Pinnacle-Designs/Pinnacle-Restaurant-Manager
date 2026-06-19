import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import {
  applyHolidayPayTemplate,
  HOLIDAY_PAY_TEMPLATES,
} from "@/lib/payroll/holiday-pay";
import { getOrCreateHolidayPayRule } from "@/lib/payroll/load-context";
import type { HolidayDenominatorMode } from "@prisma/client";

const DENOMINATOR_MODES: HolidayDenominatorMode[] = [
  "FIXED_DIVISOR",
  "DAYS_WORKED",
  "ANNUAL_PERCENTAGE",
];

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_payroll");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const rule = await getOrCreateHolidayPayRule(locationId);

  return NextResponse.json(rule);
}

export async function PUT(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_payroll");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  await getOrCreateHolidayPayRule(locationId);

  let data = {
    enabled: !!body.enabled,
    templateId: body.templateId ?? null,
    ruleName: String(body.ruleName || "Custom"),
    tenureDaysRequired: Number(body.tenureDaysRequired) || 0,
    requireFirstLastShift: !!body.requireFirstLastShift,
    lookbackDays: Number(body.lookbackDays) || 28,
    denominatorMode: DENOMINATOR_MODES.includes(body.denominatorMode)
      ? body.denominatorMode
      : "FIXED_DIVISOR",
    fixedDivisor: Number(body.fixedDivisor) || 20,
    annualPercentage:
      body.annualPercentage != null && body.annualPercentage !== ""
        ? Number(body.annualPercentage)
        : null,
    holidayPremiumMultiplier: Number(body.holidayPremiumMultiplier) || 1.5,
    substituteDayEnabled: !!body.substituteDayEnabled,
    substituteDayMultiplier: Number(body.substituteDayMultiplier) || 1,
    payStatutoryWhenOff: body.payStatutoryWhenOff !== false,
  };

  if (body.templateId && body.applyTemplate) {
    data = {
      ...data,
      ...applyHolidayPayTemplate(String(body.templateId), { enabled: data.enabled }),
    };
  }

  const rule = await prisma.holidayPayRule.update({
    where: { locationId },
    data,
  });

  return NextResponse.json(rule);
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_payroll");
  if (error) return error;

  const body = await request.json();
  const templateId = String(body.templateId || "");
  const template = HOLIDAY_PAY_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    return NextResponse.json({ error: "Unknown template" }, { status: 404 });
  }

  return NextResponse.json({
    template,
    rule: applyHolidayPayTemplate(templateId),
  });
}
