import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/** Stripe client — secret key from STRIPE_SECRET_KEY env only (never hardcode keys). */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

/** Fresh client for scripts (bypasses singleton). */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey.trim());
}
