import { addMonths, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import type { PlanId } from "@/lib/plans";
import {
  retrieveStripeCustomerPaymentSummary,
  retrieveStripeSubscription,
  planFromStripePriceId,
} from "./stripe-server";

export async function upsertStripeSubscriptionConnection(input: {
  locationId: string;
  customerId: string;
  subscriptionId: string;
  status: string;
  metadata?: Record<string, string>;
}) {
  return prisma.paymentProviderConnection.upsert({
    where: {
      locationId_purpose: { locationId: input.locationId, purpose: "SUBSCRIPTION" },
    },
    create: {
      locationId: input.locationId,
      provider: "STRIPE",
      purpose: "SUBSCRIPTION",
      accountId: input.customerId,
      externalRef: input.subscriptionId,
      status: input.status,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
    update: {
      provider: "STRIPE",
      accountId: input.customerId,
      externalRef: input.subscriptionId,
      status: input.status,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

export async function syncLocationFromStripeSubscription(
  locationId: string,
  subscriptionId: string
) {
  const subscription = await retrieveStripeSubscription(subscriptionId);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const autopayEnabled = ["active", "trialing", "past_due"].includes(subscription.status);
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : startOfDay(addMonths(new Date(), 1));

  const card = await retrieveStripeCustomerPaymentSummary(customerId);
  const plan = resolvePlanFromStripeSubscription(subscription);

  await upsertStripeSubscriptionConnection({
    locationId,
    customerId,
    subscriptionId,
    status: subscription.status,
    metadata: {
      brand: card?.brand ?? "",
      last4: card?.last4 ?? "",
      expMonth: card?.expMonth ? String(card.expMonth) : "",
      expYear: card?.expYear ? String(card.expYear) : "",
      nextBillingDate: periodEnd.toISOString(),
    },
  });

  await prisma.location.update({
    where: { id: locationId },
    data: {
      autopayEnabled,
      nextBillingDate: autopayEnabled ? periodEnd : null,
      paymentBrand: card?.brand ?? null,
      paymentLast4: card?.last4 ?? null,
      paymentExpMonth: card?.expMonth ?? null,
      paymentExpYear: card?.expYear ?? null,
      ...(plan ? { plan } : {}),
    },
  });

  if (autopayEnabled) {
    await grantOwnerAccessAfterPurchase(locationId);
  }
}

/** Confirmed Stripe subscription — owners can sign in at /login without extra gates. */
export async function grantOwnerAccessAfterPurchase(locationId: string) {
  await prisma.user.updateMany({
    where: {
      locationId,
      role: "OWNER",
      OR: [{ emailVerifiedAt: null }, { active: false }],
    },
    data: {
      emailVerifiedAt: new Date(),
      active: true,
    },
  });
}

export async function clearStripeSubscriptionForLocation(locationId: string) {
  await prisma.paymentProviderConnection.deleteMany({
    where: { locationId, purpose: "SUBSCRIPTION", provider: "STRIPE" },
  });
  await prisma.location.update({
    where: { id: locationId },
    data: {
      autopayEnabled: false,
      nextBillingDate: null,
      paymentBrand: null,
      paymentLast4: null,
      paymentExpMonth: null,
      paymentExpYear: null,
    },
  });
}

export async function markStripeSubscriptionPaymentFailed(locationId: string, subscriptionId: string) {
  await prisma.paymentProviderConnection.updateMany({
    where: {
      locationId,
      purpose: "SUBSCRIPTION",
      provider: "STRIPE",
      externalRef: subscriptionId,
    },
    data: { status: "past_due" },
  });
}

export function planFromStripeMetadata(metadata: Record<string, string> | null | undefined): PlanId | null {
  const raw = metadata?.plan?.toUpperCase();
  if (raw === "STARTER" || raw === "GROWTH" || raw === "PRO") return raw;
  return null;
}

function resolvePlanFromStripeSubscription(subscription: Awaited<
  ReturnType<typeof retrieveStripeSubscription>
>): PlanId | null {
  const fromMetadata = planFromStripeMetadata(subscription.metadata ?? undefined);
  if (fromMetadata) return fromMetadata;

  const price = subscription.items?.data?.[0]?.price;
  const priceId = typeof price === "string" ? price : price?.id;
  return planFromStripePriceId(priceId);
}
