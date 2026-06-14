import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getStripe, retrieveStripeSubscription } from "@/lib/payments/stripe-server";
import {
  planFromStripeMetadata,
  syncLocationFromStripeSubscription,
  clearStripeSubscriptionForLocation,
  markStripeSubscriptionPaymentFailed,
} from "@/lib/payments/sync-subscription";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return new Response("Webhook secret not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error("Stripe webhook verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const locationId = session.metadata?.locationId || session.client_reference_id;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (locationId && subscriptionId) {
          await syncLocationFromStripeSubscription(locationId, subscriptionId);
          const plan = planFromStripeMetadata(session.metadata ?? undefined);
          if (plan) {
            await prisma.location.update({
              where: { id: locationId },
              data: { plan },
            });
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        const locationId = subscription.metadata?.locationId;
        if (locationId) {
          await syncLocationFromStripeSubscription(locationId, subscription.id);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const locationId = subscription.metadata?.locationId;
        if (locationId) {
          await clearStripeSubscriptionForLocation(locationId);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription = await retrieveStripeSubscription(subscriptionId);
          const locationId = subscription.metadata?.locationId;
          if (locationId) {
            await markStripeSubscriptionPaymentFailed(locationId, subscriptionId);
            await syncLocationFromStripeSubscription(locationId, subscriptionId);
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return new Response("Webhook handler failed", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
