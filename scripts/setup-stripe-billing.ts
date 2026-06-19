/**
 * Create Stripe subscription products (default_price_data) and optional webhook.
 * Keys come from STRIPE_SECRET_KEY in .env only — never hardcoded.
 *
 * Usage:
 *   npm run stripe:setup
 *   npm run stripe:setup -- --write-env
 *   npm run stripe:setup:live
 *
 * @see https://docs.stripe.com/keys-best-practices
 * @see https://docs.stripe.com/api/products/create
 */
import fs from "fs";
import path from "path";
import type Stripe from "stripe";
import { createStripeClient } from "../src/lib/payments/stripe-client";
import { PLAN_BY_ID, type PlanId } from "../src/lib/plans";

const PLAN_IDS: PlanId[] = ["STARTER", "GROWTH", "PRO"];

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  let text = fs.readFileSync(envPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function appUrl(): string {
  return (
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://pinnacle-resturant-manager.vercel.app"
  ).replace(/\/$/, "");
}

function priceIdFromProduct(product: Stripe.Product): string | null {
  const dp = product.default_price;
  if (!dp) return null;
  return typeof dp === "string" ? dp : dp.id;
}

async function findExistingPlanProduct(
  stripe: Stripe,
  planId: PlanId,
  amountCents: number
): Promise<{ productId: string; priceId: string } | null> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  for (const product of products.data) {
    if (product.metadata?.plan !== planId || product.metadata?.pinnacle !== "subscription") {
      continue;
    }
    const priceId = priceIdFromProduct(product);
    if (!priceId) continue;

    const price = await stripe.prices.retrieve(priceId);
    if (
      price.type === "recurring" &&
      price.recurring?.interval === "month" &&
      price.unit_amount === amountCents &&
      price.currency === "usd" &&
      price.active
    ) {
      return { productId: product.id, priceId };
    }
  }
  return null;
}

async function ensurePlanProduct(stripe: Stripe, planId: PlanId): Promise<string> {
  const plan = PLAN_BY_ID[planId];
  const productName = `Pinnacle ${plan.name}`;
  const amountCents = Math.round(plan.price * 100);

  const existing = await findExistingPlanProduct(stripe, planId, amountCents);
  if (existing) {
    console.log(`  ${planId}: reusing product ${existing.productId}, price ${existing.priceId}`);
    return existing.priceId;
  }

  const product = await stripe.products.create({
    name: productName,
    description: plan.blurb,
    metadata: { plan: planId, pinnacle: "subscription" },
    default_price_data: {
      currency: "usd",
      unit_amount: amountCents,
      recurring: { interval: "month" },
    },
  });

  const priceId = priceIdFromProduct(product);
  if (!priceId) {
    throw new Error(`Product ${product.id} created without default_price`);
  }

  console.log(`  ${planId}: created product ${product.id}, price ${priceId}`);
  return priceId;
}

async function ensureWebhook(stripe: Stripe, url: string): Promise<string | null> {
  const endpointUrl = `${url}/api/webhooks/stripe`;
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = existing.data.find((w) => w.url === endpointUrl && w.status !== "disabled");

  if (match) {
    console.log(`\nWebhook already exists: ${match.id}`);
    console.log(`  URL: ${match.url}`);
    console.log(
      "  Signing secret: retrieve whsec_ from Stripe Dashboard (not shown again for existing endpoints)."
    );
    return null;
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url: endpointUrl,
    enabled_events: WEBHOOK_EVENTS,
    description: "Pinnacle Restaurant Manager — subscription billing",
    metadata: { app: "pinnacle-restaurant-manager" },
  });

  console.log(`\nCreated webhook endpoint: ${endpoint.id}`);
  console.log(`  URL: ${endpoint.url}`);
  return endpoint.secret ?? null;
}

function writePriceIdsToEnv(priceIds: Record<string, string>) {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    console.warn("\nNo .env file — copy price IDs manually.");
    return;
  }

  let text = fs.readFileSync(envPath, "utf8");
  const updates: Record<string, string> = {
    STRIPE_PRICE_STARTER: priceIds.STARTER!,
    STRIPE_PRICE_GROWTH: priceIds.GROWTH!,
    STRIPE_PRICE_PRO: priceIds.PRO!,
  };

  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}="${value}"`;
    if (pattern.test(text)) {
      text = text.replace(pattern, line);
    } else {
      text += `\n${line}`;
    }
  }

  fs.writeFileSync(envPath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  console.log("\nUpdated .env with STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PRO");
}

async function main() {
  loadEnvFile();

  const liveMode = process.argv.includes("--live");
  const createWebhook = process.argv.includes("--webhook");
  const writeEnv = process.argv.includes("--write-env");
  const key = process.env.STRIPE_SECRET_KEY?.trim();

  if (!key) {
    console.error("Set STRIPE_SECRET_KEY in .env — see https://dashboard.stripe.com/apikeys");
    process.exit(1);
  }

  const isLiveKey = key.startsWith("sk_live_");
  if (liveMode && !isLiveKey) {
    console.error("--live requires sk_live_... in STRIPE_SECRET_KEY.");
    process.exit(1);
  }
  if (!liveMode && isLiveKey) {
    console.warn("Warning: using live key without --live flag.");
  }

  const stripe = createStripeClient(key);
  const mode = isLiveKey ? "LIVE" : "TEST";

  console.log(`\nStripe product setup (${mode}) — ${appUrl()}\n`);
  console.log("Creating subscription products (default_price_data)…");

  const priceIds: Record<string, string> = {};
  for (const planId of PLAN_IDS) {
    priceIds[planId] = await ensurePlanProduct(stripe, planId);
  }

  if (writeEnv) {
    writePriceIdsToEnv(priceIds);
  }

  let webhookSecret: string | null = null;
  if (createWebhook) {
    webhookSecret = await ensureWebhook(stripe, appUrl());
  }

  console.log("\n--- Environment variables ---\n");
  console.log(`STRIPE_PRICE_STARTER="${priceIds.STARTER}"`);
  console.log(`STRIPE_PRICE_GROWTH="${priceIds.GROWTH}"`);
  console.log(`STRIPE_PRICE_PRO="${priceIds.PRO}"`);
  if (webhookSecret) {
    console.log(`STRIPE_WEBHOOK_SECRET="${webhookSecret}"`);
  }
  console.log(`\n# STRIPE_SECRET_KEY stays in .env / Vercel only — never commit keys.`);
  if (!writeEnv) {
    console.log("# Re-run with --write-env to save price IDs to .env");
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
