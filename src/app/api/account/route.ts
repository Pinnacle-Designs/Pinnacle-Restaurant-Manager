import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requireAuth } from "@/lib/api-auth";
import { PLAN_BY_ID, type PlanId } from "@/lib/plans";
import { planMonthlyAmount } from "@/lib/billing";

export async function GET(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: {
      name: true,
      plan: true,
      autopayEnabled: true,
      billingEmail: true,
      paymentBrand: true,
      paymentLast4: true,
      paymentExpMonth: true,
      paymentExpYear: true,
      nextBillingDate: true,
    },
  });

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const plan = location.plan as PlanId;
  const canManageBilling = user!.role === "OWNER";

  return NextResponse.json({
    profile: {
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: user!.role,
      avatarUrl: user!.avatarUrl ?? null,
    },
    location: {
      id: locationId,
      name: location.name,
    },
    billing: {
      plan,
      planName: PLAN_BY_ID[plan].name,
      monthlyAmount: planMonthlyAmount(plan),
      autopayEnabled: location.autopayEnabled,
      billingEmail: location.billingEmail,
      paymentBrand: canManageBilling ? location.paymentBrand : null,
      paymentLast4: canManageBilling ? location.paymentLast4 : null,
      paymentExpMonth: canManageBilling ? location.paymentExpMonth : null,
      paymentExpYear: canManageBilling ? location.paymentExpYear : null,
      nextBillingDate: location.nextBillingDate?.toISOString() ?? null,
      hasPaymentMethod: Boolean(location.paymentLast4),
      canManage: canManageBilling,
    },
  });
}
