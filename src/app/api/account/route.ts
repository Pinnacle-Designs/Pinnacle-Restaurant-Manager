import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSecureAuth } from "@/lib/api-auth";
import { userManagesBilling } from "@/lib/billing-auth";
import { PLAN_BY_ID, type PlanId } from "@/lib/plans";
import { planMonthlyAmount } from "@/lib/billing";
import { privateJsonResponse } from "@/lib/secure-response";
import { isStaffPinLoginEmail } from "@/lib/staff-pin-email";
import {
  getProviderConnections,
  safeConnectionView,
  kindToSubscriptionId,
  kindToPosId,
} from "@/lib/payments/providers";

export async function GET(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const locationId = user!.locationId;
  if (!locationId) {
    return privateJsonResponse({ error: "No location assigned to this account" }, { status: 404 });
  }

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
    return privateJsonResponse({ error: "Location not found" }, { status: 404 });
  }

  const plan = location.plan as PlanId;
  const canManageBilling = userManagesBilling(user!);
  const connections = await getProviderConnections(locationId);
  const subscriptionConn = connections.find((c) => c.purpose === "SUBSCRIPTION") ?? null;
  const posConn = connections.find((c) => c.purpose === "POS") ?? null;
  const subscriptionProvider = kindToSubscriptionId(subscriptionConn?.provider);
  const posProvider = kindToPosId(posConn?.provider);
  const stripeBilling = subscriptionConn?.provider === "STRIPE";

  return privateJsonResponse({
    profile: {
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: user!.role,
      avatarUrl: user!.avatarUrl ?? null,
      usesPinLogin: isStaffPinLoginEmail(user!.email),
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
      billingEmail: canManageBilling ? location.billingEmail : null,
      paymentBrand: canManageBilling ? location.paymentBrand : null,
      paymentLast4: canManageBilling ? location.paymentLast4 : null,
      paymentExpMonth: canManageBilling ? location.paymentExpMonth : null,
      paymentExpYear: canManageBilling ? location.paymentExpYear : null,
      nextBillingDate: canManageBilling
        ? location.nextBillingDate?.toISOString() ?? null
        : null,
      hasPaymentMethod: canManageBilling
        ? stripeBilling
          ? Boolean(subscriptionConn?.metadata)
          : Boolean(location.paymentLast4)
        : false,
      canManage: canManageBilling,
      subscriptionProvider,
      posProvider,
      integrations: {
        subscription: safeConnectionView(subscriptionConn),
        pos: safeConnectionView(posConn),
      },
    },
  });
}
