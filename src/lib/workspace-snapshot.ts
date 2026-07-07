import { prisma } from "./prisma";
import type { PlanId } from "./plans";
import { billingRequired, isWithinTrial, isActiveStripeSubscriptionStatus } from "./plan-billing";
import {
  WORKSPACE_COOKIE_MAX_AGE,
  type WorkspaceSnapshot,
} from "./workspace-cookie";

export async function buildWorkspaceSnapshot(
  locationId: string
): Promise<WorkspaceSnapshot | null> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: {
      id: true,
      plan: true,
      autopayEnabled: true,
      setupComplete: true,
      createdAt: true,
      active: true,
    },
  });
  if (!location || !location.active) return null;

  const subscription = await prisma.paymentProviderConnection.findUnique({
    where: { locationId_purpose: { locationId, purpose: "SUBSCRIPTION" } },
    select: { provider: true, status: true },
  });

  const stripeSubscriptionActive = subscription
    ? subscription.provider === "STRIPE"
      ? isActiveStripeSubscriptionStatus(subscription.status)
      : subscription.status === "connected"
    : false;

  const plan = location.plan as PlanId;
  const required = billingRequired();

  return {
    locationId: location.id,
    plan,
    autopayEnabled: location.autopayEnabled,
    billingRequired: required,
    trialActive: isWithinTrial(location.createdAt),
    stripeSubscriptionActive,
    setupComplete: location.setupComplete,
    exp: Date.now() + WORKSPACE_COOKIE_MAX_AGE * 1000,
  };
}
