import type { WorkspaceSnapshot } from "./workspace-cookie";

const TRIAL_DAYS = Number(process.env.PLAN_TRIAL_DAYS ?? 14);

const ACTIVE_STRIPE_STATUSES = new Set(["active", "trialing", "past_due", "connected"]);

/** Production + Stripe configured → subscription or trial required for full app access. */
export function billingRequired(): boolean {
  if (process.env.PLAN_BILLING_OPTIONAL === "true") return false;
  if (process.env.NODE_ENV !== "production") return false;
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function isWithinTrial(createdAt: Date): boolean {
  if (TRIAL_DAYS <= 0) return false;
  return Date.now() - createdAt.getTime() < TRIAL_DAYS * 24 * 60 * 60 * 1000;
}

export function hasActiveBilling(snapshot: WorkspaceSnapshot): boolean {
  if (!snapshot.billingRequired) return true;
  if (snapshot.trialActive) return true;
  if (snapshot.stripeSubscriptionActive) return true;
  return false;
}

export function isBillingAllowedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/download") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/api/onboarding") ||
    pathname.startsWith("/api/account") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/webhooks/stripe")
  );
}

export function isActiveStripeSubscriptionStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ACTIVE_STRIPE_STATUSES.has(status);
}
