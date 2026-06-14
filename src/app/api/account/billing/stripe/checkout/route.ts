import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSecureAuth } from "@/lib/api-auth";
import { getVerifiedOwnerLocationId } from "@/lib/billing-auth";
import { createStripeCheckoutSession } from "@/lib/payments/stripe-server";
import { getProviderConnection, stripeConfigured } from "@/lib/payments/providers";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";
import type { PlanId } from "@/lib/plans";

export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (!stripeConfigured()) {
    return privateJsonResponse(
      { error: "Stripe is not configured on this deployment" },
      { status: 503 }
    );
  }

  if (isRateLimited(`stripe-checkout:${user!.id}`, 5, 60_000)) {
    return privateJsonResponse({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { locationId, error: ownerError } = await getVerifiedOwnerLocationId(user);
  if (ownerError) return ownerError;

  const location = await prisma.location.findUnique({
    where: { id: locationId! },
    select: { plan: true, billingEmail: true },
  });
  if (!location) {
    return privateJsonResponse({ error: "Location not found" }, { status: 404 });
  }

  const existing = await getProviderConnection(locationId!, "SUBSCRIPTION");
  const body = await request.json().catch(() => ({}));
  const returnTo = body?.returnTo === "onboarding" ? "onboarding" : "billing";
  const session = await createStripeCheckoutSession({
    locationId: locationId!,
    plan: location.plan as PlanId,
    customerId: existing?.accountId,
    customerEmail: location.billingEmail || user!.email,
    returnTo,
  });

  return privateJsonResponse({ url: session.url });
}
