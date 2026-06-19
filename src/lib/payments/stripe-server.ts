import type Stripe from "stripe";
import type { PlanId } from "@/lib/plans";
import { PLAN_BY_ID } from "@/lib/plans";
import { planMonthlyAmount } from "@/lib/billing";
import { appBaseUrl } from "./providers";
import { getStripe } from "./stripe-client";

export { getStripe } from "./stripe-client";

function stripePriceIdForPlan(plan: PlanId): string | null {
  const map: Record<PlanId, string | undefined> = {
    STARTER: process.env.STRIPE_PRICE_STARTER,
    GROWTH: process.env.STRIPE_PRICE_GROWTH,
    PRO: process.env.STRIPE_PRICE_PRO,
  };
  return map[plan]?.trim() || null;
}

function resolveCheckoutPriceId(plan: PlanId): string {
  const priceId = stripePriceIdForPlan(plan);
  if (priceId) return priceId;

  const isProd =
    process.env.NODE_ENV === "production" && process.env.PLAN_BILLING_OPTIONAL !== "true";
  if (isProd) {
    throw new Error(
      `STRIPE_PRICE_${plan} is not set. Run npm run stripe:setup:live and add price IDs to Vercel.`
    );
  }
  return "";
}

/**
 * Stripe Checkout for plan autopay.
 * Keys from STRIPE_SECRET_KEY env only — @see https://docs.stripe.com/keys-best-practices
 * Uses catalog price IDs (product default_price) when STRIPE_PRICE_* env vars are set.
 */
export async function createStripeCheckoutSession(input: {
  locationId: string;
  plan: PlanId;
  customerId?: string | null;
  customerEmail: string;
  returnTo?: "billing" | "onboarding";
}) {
  const stripe = getStripe();
  const planDef = PLAN_BY_ID[input.plan];
  const amount = planMonthlyAmount(input.plan);
  const priceId = resolveCheckoutPriceId(input.plan);
  const base = appBaseUrl();

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priceId
    ? [{ price: priceId, quantity: 1 }]
    : [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amount * 100),
            recurring: { interval: "month" },
            product_data: {
              name: `Pinnacle ${planDef.name}`,
              description: planDef.blurb,
            },
          },
          quantity: 1,
        },
      ];

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.customerId ?? undefined,
    customer_email: input.customerId ? undefined : input.customerEmail,
    client_reference_id: input.locationId,
    metadata: {
      locationId: input.locationId,
      plan: input.plan,
    },
    subscription_data: {
      metadata: {
        locationId: input.locationId,
        plan: input.plan,
      },
    },
    line_items: lineItems,
    success_url:
      input.returnTo === "onboarding"
        ? `${base}/download?from=onboarding`
        : `${base}/download?from=checkout`,
    cancel_url:
      input.returnTo === "onboarding"
        ? `${base}/onboarding?stripe=cancel`
        : `${base}/account?tab=billing&stripe=cancel`,
    allow_promotion_codes: true,
  });
}

export async function createStripeBillingPortalSession(customerId: string) {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appBaseUrl()}/account?tab=billing`,
  });
}

export async function createStripeConnectOAuthUrl(locationId: string, state: string) {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("STRIPE_CONNECT_CLIENT_ID is not configured");
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    state,
    redirect_uri: `${appBaseUrl()}/api/account/billing/stripe/connect/callback`,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeStripeConnectCode(code: string) {
  const stripe = getStripe();
  return stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });
}

export async function retrieveStripeSubscription(subscriptionId: string) {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["default_payment_method"],
  });
}

export async function retrieveStripeCustomerPaymentSummary(customerId: string) {
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if (customer.deleted) return null;

  const pm = customer.invoice_settings?.default_payment_method;
  if (!pm || typeof pm === "string") return null;

  if (pm.type === "card" && pm.card) {
    return {
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    };
  }
  return null;
}
