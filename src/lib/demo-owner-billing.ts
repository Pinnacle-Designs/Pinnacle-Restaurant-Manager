import { addDays } from "date-fns";
import type { SubscriptionPlan } from "@prisma/client";
import { prisma } from "./prisma";
import { SUBSCRIPTION_CONTRACT_VERSION } from "./subscription-contracts";
import { OWNER_DEMO_EMAIL } from "./demo-users";

/** Stripe checkout success path for the embed owner demo account. */
export const OWNER_DEMO_POST_CHECKOUT_PATH = "/download?from=checkout";

async function ensureDemoSubscriptionBilling(
  locationId: string,
  ownerUserId: string,
  plan: SubscriptionPlan,
  options: { setupComplete: boolean; onboardingStep: number; stripeCustomerId: string }
) {
  await prisma.location.update({
    where: { id: locationId },
    data: {
      setupComplete: options.setupComplete,
      onboardingStep: options.onboardingStep,
      autopayEnabled: true,
      billingEmail: "marcus@smokyoakbbq.com",
      paymentBrand: "Visa",
      paymentLast4: "4242",
      paymentExpMonth: 8,
      paymentExpYear: 2028,
      nextBillingDate: addDays(new Date(), 18),
      plan,
      subscriptionTermsAcceptedAt: new Date(),
      subscriptionTermsVersion: SUBSCRIPTION_CONTRACT_VERSION,
      subscriptionTermsPlan: plan,
      subscriptionTermsAcceptedById: ownerUserId,
    },
  });

  await prisma.paymentProviderConnection.upsert({
    where: { locationId_purpose: { locationId, purpose: "SUBSCRIPTION" } },
    create: {
      locationId,
      provider: "STRIPE",
      purpose: "SUBSCRIPTION",
      status: "connected",
      accountId: options.stripeCustomerId,
      metadata: JSON.stringify({
        demo: true,
        subscriptionId: `sub_demo_${plan.toLowerCase()}`,
        label: "Visa •••• 4242",
      }),
    },
    update: {
      provider: "STRIPE",
      status: "connected",
      accountId: options.stripeCustomerId,
      metadata: JSON.stringify({
        demo: true,
        subscriptionId: `sub_demo_${plan.toLowerCase()}`,
        label: "Visa •••• 4242",
      }),
    },
  });
}

/** Mark the owner demo workspace as paid so the download step is available. */
export async function ensureOwnerDemoPostCheckout(locationId: string, ownerUserId: string) {
  await ensureDemoSubscriptionBilling(locationId, ownerUserId, "PRO", {
    setupComplete: false,
    onboardingStep: 3,
    stripeCustomerId: "cus_demo_owner",
  });
}

/** Fully onboarded plan-tier demo — active subscription with the correct plan limits. */
export async function ensurePlanDemoWorkspaceReady(
  locationId: string,
  ownerUserId: string,
  plan: SubscriptionPlan
) {
  await ensureDemoSubscriptionBilling(locationId, ownerUserId, plan, {
    setupComplete: true,
    onboardingStep: 4,
    stripeCustomerId: `cus_demo_${plan.toLowerCase()}`,
  });
}

export function ownerDemoPostCheckoutRedirect(email: string): string | null {
  if (email.trim().toLowerCase() === OWNER_DEMO_EMAIL) {
    return OWNER_DEMO_POST_CHECKOUT_PATH;
  }
  return null;
}
