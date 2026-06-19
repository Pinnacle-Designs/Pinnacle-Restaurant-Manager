import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSecureAuth } from "@/lib/api-auth";
import { getVerifiedOwnerLocationId } from "@/lib/billing-auth";
import {
  containsForbiddenPaymentFields,
  defaultNextBillingDate,
  isValidExpiry,
  parseCardNumber,
} from "@/lib/billing";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";
import { getProviderConnection } from "@/lib/payments/providers";
import { validateSubscriptionTermsAcceptance } from "@/lib/subscription-contracts";
import { recordSubscriptionTermsAcceptance } from "@/lib/subscription-terms-record";
import type { PlanId } from "@/lib/plans";

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (
    await isRateLimited(`billing:${user!.id}`, 8, 60_000)
  ) {
    return privateJsonResponse(
      { error: "Too many billing attempts. Try again shortly." },
      { status: 429 }
    );
  }

  const { locationId, error: ownerError } = await getVerifiedOwnerLocationId(user);
  if (ownerError) return ownerError;

  const stripeConnection = await getProviderConnection(locationId!, "SUBSCRIPTION");
  const usesStripe = stripeConnection?.provider === "STRIPE";

  const body = (await request.json()) as Record<string, unknown>;

  if (containsForbiddenPaymentFields(body)) {
    return privateJsonResponse({ error: "Invalid payment request" }, { status: 400 });
  }

  const autopayEnabled = body.autopayEnabled === true;
  const billingEmail = body.billingEmail
    ? String(body.billingEmail).trim().toLowerCase()
    : undefined;
  const cardNumber = body.cardNumber ? String(body.cardNumber) : "";
  const expMonth = body.expMonth != null ? Number(body.expMonth) : null;
  const expYear = body.expYear != null ? Number(body.expYear) : null;
  const removePaymentMethod = body.removePaymentMethod === true;

  if (usesStripe && (cardNumber || removePaymentMethod || body.autopayEnabled !== undefined)) {
    return privateJsonResponse(
      {
        error:
          "Subscription billing is managed through Stripe. Use Manage billing to update your payment method.",
      },
      { status: 400 }
    );
  }

  const location = await prisma.location.findUnique({
    where: { id: locationId! },
    select: {
      plan: true,
      paymentLast4: true,
      paymentBrand: true,
      paymentExpMonth: true,
      paymentExpYear: true,
      billingEmail: true,
      nextBillingDate: true,
      autopayEnabled: true,
    },
  });

  if (!location) {
    return privateJsonResponse({ error: "Location not found" }, { status: 404 });
  }

  if (
    billingEmail !== undefined &&
    billingEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)
  ) {
    return privateJsonResponse({ error: "Enter a valid billing email" }, { status: 400 });
  }

  let paymentBrand = location.paymentBrand;
  let paymentLast4 = location.paymentLast4;
  let paymentExpMonth = location.paymentExpMonth;
  let paymentExpYear = location.paymentExpYear;

  if (removePaymentMethod) {
    paymentBrand = null;
    paymentLast4 = null;
    paymentExpMonth = null;
    paymentExpYear = null;
  } else if (cardNumber) {
    const parsed = parseCardNumber(cardNumber);
    if (!parsed) {
      return privateJsonResponse({ error: "Enter a valid card number" }, { status: 400 });
    }
    if (expMonth == null || expYear == null || !isValidExpiry(expMonth, expYear)) {
      return privateJsonResponse({ error: "Enter a valid expiration date" }, { status: 400 });
    }
    paymentBrand = parsed.brand;
    paymentLast4 = parsed.last4;
    paymentExpMonth = expMonth;
    paymentExpYear = expYear < 100 ? 2000 + expYear : expYear;
  }

  if (autopayEnabled && !paymentLast4) {
    return privateJsonResponse(
      { error: "Add a payment method before enabling autopay" },
      { status: 400 }
    );
  }

  const enablingAutopay = autopayEnabled && !location.autopayEnabled;
  if (enablingAutopay) {
    const termsCheck = validateSubscriptionTermsAcceptance(body, location.plan as PlanId);
    if (!termsCheck.ok) {
      return privateJsonResponse({ error: termsCheck.error }, { status: 400 });
    }
    await recordSubscriptionTermsAcceptance(locationId!, location.plan as PlanId, user!.id);
  }

  const nextBillingDate =
    autopayEnabled && !location.nextBillingDate
      ? defaultNextBillingDate()
      : location.nextBillingDate;

  const updated = await prisma.location.update({
    where: { id: locationId! },
    data: {
      autopayEnabled,
      billingEmail: billingEmail ?? location.billingEmail ?? user!.email,
      paymentBrand,
      paymentLast4,
      paymentExpMonth,
      paymentExpYear,
      nextBillingDate: autopayEnabled ? nextBillingDate : null,
    },
    select: {
      autopayEnabled: true,
      billingEmail: true,
      paymentBrand: true,
      paymentLast4: true,
      paymentExpMonth: true,
      paymentExpYear: true,
      nextBillingDate: true,
    },
  });

  return privateJsonResponse({
    billing: {
      ...updated,
      nextBillingDate: updated.nextBillingDate?.toISOString() ?? null,
      hasPaymentMethod: Boolean(updated.paymentLast4),
    },
  });
}
