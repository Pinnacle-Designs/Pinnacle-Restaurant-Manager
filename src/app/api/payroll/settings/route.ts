import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { getOrCreatePayrollSettings } from "@/lib/payroll/load-context";
import { parseTipPoolRoles, serializeTipPoolRoles } from "@/lib/payroll/compute";
import type { TipPoolMode } from "@prisma/client";

const TIP_POOL_MODES: TipPoolMode[] = ["INDIVIDUAL", "FULL_POOL", "POINTS", "ROLE_WEIGHTED"];

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_payroll");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const settings = await getOrCreatePayrollSettings(locationId);

  return NextResponse.json({
    ...settings,
    tipPoolRoles: parseTipPoolRoles(settings.tipPoolRoles),
  });
}

export async function PUT(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_payroll");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  await getOrCreatePayrollSettings(locationId);

  const tipPoolMode = TIP_POOL_MODES.includes(body.tipPoolMode)
    ? body.tipPoolMode
    : "INDIVIDUAL";

  const settings = await prisma.payrollSettings.update({
    where: { locationId },
    data: {
      minimumWage: Number(body.minimumWage) || 7.25,
      tipCredit: Number(body.tipCredit) || 5.12,
      tippedMinCashWage: Number(body.tippedMinCashWage) || 2.13,
      weeklyOtThresholdHours: Number(body.weeklyOtThresholdHours) || 40,
      dailyOtThresholdHours:
        body.dailyOtThresholdHours != null && body.dailyOtThresholdHours !== ""
          ? Number(body.dailyOtThresholdHours)
          : null,
      otMultiplier: Number(body.otMultiplier) || 1.5,
      useBlendedOtRate: body.useBlendedOtRate !== false,
      splitShiftEnabled: !!body.splitShiftEnabled,
      splitShiftPremiumHours: Number(body.splitShiftPremiumHours) || 1,
      splitShiftMinGapMinutes: Number(body.splitShiftMinGapMinutes) || 60,
      tipPoolMode,
      tipPoolRoles: serializeTipPoolRoles(
        Array.isArray(body.tipPoolRoles) ? body.tipPoolRoles : null
      ),
      ewaEnabled: !!body.ewaEnabled,
      ewaMaxPercent: Number(body.ewaMaxPercent) || 50,
      ewaMaxPerAdvance: Number(body.ewaMaxPerAdvance) || 200,
      ewaFeeFlat: Number(body.ewaFeeFlat) || 0,
      payPeriodDays: Number(body.payPeriodDays) || 14,
      embeddedPayrollProvider: ["NONE", "GUSTO", "WAGEPOINT", "PAPAYA_GLOBAL"].includes(
        body.embeddedPayrollProvider
      )
        ? body.embeddedPayrollProvider
        : "NONE",
      embeddedPayrollConnected: !!body.embeddedPayrollConnected,
    },
  });

  return NextResponse.json({
    ...settings,
    tipPoolRoles: parseTipPoolRoles(settings.tipPoolRoles),
  });
}
