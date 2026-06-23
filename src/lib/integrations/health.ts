import {
  stripeConfigured,
  stripeConnectConfigured,
  squareConfigured,
} from "@/lib/payments/providers";
import { smtpConfigured } from "@/lib/email/smtp";

export type IntegrationMode = "live" | "demo" | "optional" | "not_configured";

export interface IntegrationStatus {
  id: string;
  name: string;
  category: string;
  mode: IntegrationMode;
  configured: boolean;
  message: string;
}

function hasEnv(...keys: string[]): boolean {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}

function optionalLive(
  id: string,
  name: string,
  category: string,
  configured: boolean,
  liveMessage: string,
  fallbackMessage: string
): IntegrationStatus {
  return {
    id,
    name,
    category,
    configured,
    mode: configured ? "live" : "optional",
    message: configured ? liveMessage : fallbackMessage,
  };
}

/** Runtime status for every external integration — used by health API and admin diagnostics. */
export function getIntegrationHealth(): IntegrationStatus[] {
  const openAi = hasEnv("OPENAI_API_KEY");
  const twilio = hasEnv("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER");
  const metaLive = hasEnv("META_ACCESS_TOKEN", "META_PAGE_ID");
  const xLive = hasEnv("X_BEARER_TOKEN");
  const accountingCreds =
    hasEnv("QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET") ||
    hasEnv("XERO_CLIENT_ID", "XERO_CLIENT_SECRET") ||
    hasEnv("SAGE_CLIENT_ID", "SAGE_CLIENT_SECRET");
  const ediCreds =
    hasEnv("SYSCO_EDI_API_KEY") ||
    hasEnv("US_FOODS_EDI_API_KEY") ||
    hasEnv("GORDON_FOOD_SERVICE_EDI_API_KEY");
  const reservationCreds =
    hasEnv("OPENTABLE_PARTNER_API_KEY") ||
    hasEnv("OPENTABLE_CLIENT_ID") ||
    hasEnv("RESY_API_KEY") ||
    hasEnv("TOCK_API_KEY") ||
    hasEnv("YELP_FUSION_API_KEY");
  const deliveryCreds =
    hasEnv("DOORDASH_API_KEY") ||
    hasEnv("UBER_EATS_API_KEY") ||
    hasEnv("GRUBHUB_API_KEY");

  return [
    {
      id: "stripe_billing",
      name: "Stripe subscriptions",
      category: "Payments",
      configured: stripeConfigured(),
      mode: stripeConfigured() ? "live" : "not_configured",
      message: stripeConfigured()
        ? "Stripe billing configured for subscription autopay."
        : "Add STRIPE_SECRET_KEY for live subscription billing.",
    },
    {
      id: "stripe_connect",
      name: "Stripe Connect",
      category: "Payments",
      configured: stripeConnectConfigured(),
      mode: stripeConnectConfigured() ? "live" : "not_configured",
      message: stripeConnectConfigured()
        ? "Stripe Connect OAuth ready for guest card payments."
        : "Add STRIPE_CONNECT_CLIENT_ID for guest card OAuth.",
    },
    {
      id: "square",
      name: "Square",
      category: "Payments",
      configured: squareConfigured(),
      mode: squareConfigured() ? "live" : "not_configured",
      message: squareConfigured()
        ? "Square OAuth configured for guest payments."
        : "Add SQUARE_APPLICATION_ID and SQUARE_APPLICATION_SECRET.",
    },
    optionalLive(
      "openai",
      "OpenAI",
      "AI",
      openAi,
      "OpenAI API enabled for vision and insights.",
      "Rule-based AI fallback active — set OPENAI_API_KEY to enhance."
    ),
    {
      id: "twilio",
      name: "Twilio SMS",
      category: "Hiring",
      configured: twilio,
      mode: twilio ? "live" : "optional",
      message: twilio
        ? "Twilio configured — enable smsEnabled in hiring settings per location."
        : "SMS simulated in-app until Twilio credentials are added.",
    },
    {
      id: "smtp",
      name: "SMTP email",
      category: "Vendor",
      configured: smtpConfigured(),
      mode: smtpConfigured() ? "live" : "optional",
      message: smtpConfigured()
        ? "SMTP relay configured for vendor credit requests and PO email."
        : "Vendor emails logged in activity until SMTP is configured.",
    },
    {
      id: "social_meta",
      name: "Meta (Facebook / Instagram)",
      category: "Social",
      configured: metaLive,
      mode: metaLive ? "live" : "optional",
      message: metaLive
        ? "Meta Graph API ready for Facebook and Instagram publishing."
        : "Social posts simulated until META_ACCESS_TOKEN and META_PAGE_ID are set.",
    },
    {
      id: "social_x",
      name: "X (Twitter)",
      category: "Social",
      configured: xLive,
      mode: xLive ? "live" : "optional",
      message: xLive
        ? "X API ready for live publishing."
        : "X posts simulated until X_BEARER_TOKEN is set.",
    },
    {
      id: "social_other",
      name: "TikTok / YouTube / LinkedIn / Pinterest / Snapchat",
      category: "Social",
      configured: false,
      mode: "demo",
      message:
        "Publishing simulated for these platforms until dedicated API clients are added.",
    },
    {
      id: "weather",
      name: "Weather forecast",
      category: "Operations",
      configured: true,
      mode: "live",
      message: hasEnv("WEATHER_COM_API_KEY") || hasEnv("OPENWEATHER_API_KEY")
        ? "Premium weather APIs configured with Open-Meteo fallback."
        : "Open-Meteo keyless forecast active.",
    },
    {
      id: "accounting",
      name: "Accounting (QuickBooks / Xero / Sage)",
      category: "Finance",
      configured: accountingCreds,
      mode: accountingCreds ? "demo" : "demo",
      message: accountingCreds
        ? "Credentials detected — journal entries sync locally; OAuth APIs pending."
        : "Demo mode — journal entries post inside Pinnacle.",
    },
    {
      id: "vendor_edi",
      name: "Vendor EDI (Sysco / US Foods / GFS)",
      category: "Purchasing",
      configured: ediCreds,
      mode: ediCreds ? "demo" : "demo",
      message: ediCreds
        ? "EDI keys detected — catalog and PO flows run locally until partner APIs are wired."
        : "Demo catalog and purchase orders active.",
    },
    {
      id: "reservations",
      name: "Reservations (OpenTable / Resy / Tock / Yelp)",
      category: "Front of house",
      configured: reservationCreds,
      mode: reservationCreds ? "demo" : "demo",
      message: reservationCreds
        ? "Partner keys detected — demo reservations import until live pull is enabled."
        : "Demo reservation sync active.",
    },
    {
      id: "delivery_menus",
      name: "Delivery menus (DoorDash / Uber Eats / Grubhub)",
      category: "Menu",
      configured: deliveryCreds,
      mode: deliveryCreds ? "demo" : "demo",
      message: deliveryCreds
        ? "Marketplace credentials detected — menu payloads prepared for push."
        : "Menu payloads generated locally for each channel.",
    },
    {
      id: "website_analytics",
      name: "Website analytics",
      category: "Marketing",
      configured: hasEnv("GOOGLE_ANALYTICS_PROPERTY_ID"),
      mode: "demo",
      message: hasEnv("GOOGLE_ANALYTICS_PROPERTY_ID")
        ? "GA property ID set — traffic metrics use simulated sync until GA Data API is wired."
        : "Website traffic metrics simulated.",
    },
    {
      id: "automation_webhook",
      name: "Automation webhook (Zapier / Make / n8n)",
      category: "Automation",
      configured: hasEnv("INTEGRATION_WEBHOOK_SECRET"),
      mode: hasEnv("INTEGRATION_WEBHOOK_SECRET") ? "live" : "optional",
      message: hasEnv("INTEGRATION_WEBHOOK_SECRET")
        ? "Webhook secret configured for inbound automation."
        : "Webhook accepts authenticated session or set INTEGRATION_WEBHOOK_SECRET.",
    },
    {
      id: "webauthn",
      name: "WebAuthn time clock",
      category: "Staff",
      configured: hasEnv("NEXT_PUBLIC_APP_URL"),
      mode: hasEnv("NEXT_PUBLIC_APP_URL") ? "live" : "optional",
      message: hasEnv("NEXT_PUBLIC_APP_URL")
        ? "WebAuthn challenges persisted in database."
        : "Set NEXT_PUBLIC_APP_URL for production WebAuthn RP ID.",
    },
  ];
}

export function summarizeIntegrationHealth(statuses: IntegrationStatus[]) {
  const live = statuses.filter((s) => s.mode === "live").length;
  const demo = statuses.filter((s) => s.mode === "demo").length;
  const optional = statuses.filter((s) => s.mode === "optional").length;
  const notConfigured = statuses.filter((s) => s.mode === "not_configured").length;
  const issues = statuses.filter(
    (s) => s.mode === "not_configured" && ["stripe_billing"].includes(s.id)
  );

  return {
    total: statuses.length,
    live,
    demo,
    optional,
    notConfigured,
    healthy: issues.length === 0,
    statuses,
  };
}
