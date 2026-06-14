import {
  buildProviderOptions,
  getProviderConnections,
  stripeConfigured,
  squareConfigured,
  stripeConnectConfigured,
  appBaseUrl,
} from "./providers";
import { kindToPosId, kindToSubscriptionId } from "./types";

export interface PaymentSecurityPractice {
  title: string;
  detail: string;
}

export const PAYMENT_SECURITY_PRACTICES: PaymentSecurityPractice[] = [
  {
    title: "PCI-compliant card handling",
    detail:
      "Stripe Checkout and Square OAuth keep full card numbers off Pinnacle servers. Use hosted flows in production — not manual entry.",
  },
  {
    title: "Encrypted sessions",
    detail:
      "Account sessions use signed HTTP-only cookies. Production requires AUTH_SECRET (32+ characters).",
  },
  {
    title: "Owner-only billing",
    detail:
      "Subscription and POS integrations can only be changed by the verified location owner.",
  },
  {
    title: "Rate limiting",
    detail:
      "Login, billing, password, and checkout endpoints are rate-limited to reduce abuse.",
  },
  {
    title: "Webhook verification",
    detail:
      "Stripe webhooks are signature-verified before updating subscription status.",
  },
];

export const PAYMENT_SETUP_STEPS = {
  stripeSubscription: [
    "Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to your environment.",
    "Set NEXT_PUBLIC_APP_URL to your public app URL (e.g. https://your-app.vercel.app).",
    "In Stripe Dashboard → Developers → Webhooks, point to /api/webhooks/stripe.",
    "Subscribe to: checkout.session.completed, customer.subscription.*, invoice.payment_failed.",
    "Optional: set STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PRO for fixed prices.",
    "In Account → Billing, click Set up autopay with Stripe.",
  ],
  squarePos: [
    "Create a Square application and add SQUARE_APPLICATION_ID and SQUARE_APPLICATION_SECRET.",
    "Set SQUARE_ENVIRONMENT=sandbox for testing or production for live.",
    "Add redirect URL: {APP_URL}/api/account/billing/square/callback",
    "In Account → Billing → Guest payments, click Connect Square.",
  ],
  stripeConnectPos: [
    "Enable Stripe Connect and add STRIPE_CONNECT_CLIENT_ID.",
    "Add redirect URL: {APP_URL}/api/account/billing/stripe/connect/callback",
    "In Account → Billing → Guest payments, click Connect Stripe.",
  ],
} as const;

export async function getPaymentSupportSnapshot(locationId: string | null) {
  const connections = locationId ? await getProviderConnections(locationId) : [];
  const subscriptionConn = connections.find((c) => c.purpose === "SUBSCRIPTION") ?? null;
  const posConn = connections.find((c) => c.purpose === "POS") ?? null;
  const base = appBaseUrl();

  return {
    platform: {
      stripe: stripeConfigured(),
      square: squareConfigured(),
      stripeConnect: stripeConnectConfigured(),
      appUrl: base,
    },
    connections: {
      subscription: kindToSubscriptionId(subscriptionConn?.provider),
      pos: kindToPosId(posConn?.provider),
    },
    providers: buildProviderOptions(connections),
    security: PAYMENT_SECURITY_PRACTICES,
    setup: {
      stripeSubscription: PAYMENT_SETUP_STEPS.stripeSubscription,
      squarePos: PAYMENT_SETUP_STEPS.squarePos.map((s) => s.replace("{APP_URL}", base)),
      stripeConnectPos: PAYMENT_SETUP_STEPS.stripeConnectPos.map((s) =>
        s.replace("{APP_URL}", base)
      ),
    },
    support: {
      email: process.env.SUPPORT_EMAIL?.trim() || "support@pinnacle.app",
      docsUrl: "/docs/#pricing",
      webhookUrl: `${base}/api/webhooks/stripe`,
    },
  };
}
