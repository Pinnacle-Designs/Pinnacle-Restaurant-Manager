import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSecureAuth } from "@/lib/api-auth";
import { getVerifiedOwnerLocationId } from "@/lib/billing-auth";
import {
  buildProviderOptions,
  getProviderConnections,
  safeConnectionView,
  stripeConfigured,
  squareConfigured,
  stripeConnectConfigured,
} from "@/lib/payments/providers";
import { billingRequired } from "@/lib/plan-billing";
import { privateJsonResponse } from "@/lib/secure-response";

export async function GET(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const locationId = user!.locationId;
  if (!locationId) {
    return privateJsonResponse({ error: "No location assigned" }, { status: 404 });
  }

  const connections = await getProviderConnections(locationId);
  const subscription = connections.find((c) => c.purpose === "SUBSCRIPTION") ?? null;
  const pos = connections.find((c) => c.purpose === "POS") ?? null;

  return privateJsonResponse({
    platform: {
      stripe: stripeConfigured(),
      square: squareConfigured(),
      stripeConnect: stripeConnectConfigured(),
    },
    providers: buildProviderOptions(connections),
    subscription: safeConnectionView(subscription),
    pos: safeConnectionView(pos),
    canManage: user!.role === "OWNER",
  });
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const { locationId, error: ownerError } = await getVerifiedOwnerLocationId(user);
  if (ownerError) return ownerError;

  const body = await request.json();
  const mode = String(body.mode || "");

  if (mode === "manual") {
    if (billingRequired()) {
      return privateJsonResponse(
        { error: "Manual billing is disabled in production. Use Stripe Checkout." },
        { status: 403 }
      );
    }
    await prisma.paymentProviderConnection.deleteMany({
      where: { locationId: locationId!, purpose: "SUBSCRIPTION", provider: "STRIPE" },
    });
    await prisma.paymentProviderConnection.upsert({
      where: { locationId_purpose: { locationId: locationId!, purpose: "SUBSCRIPTION" } },
      create: {
        locationId: locationId!,
        provider: "MANUAL",
        purpose: "SUBSCRIPTION",
        status: "manual",
      },
      update: {
        provider: "MANUAL",
        accountId: null,
        externalRef: null,
        credential: null,
        status: "manual",
        metadata: null,
      },
    });
    return privateJsonResponse({ message: "Using manual billing entry" });
  }

  if (mode === "disconnect-pos") {
    await prisma.paymentProviderConnection.deleteMany({
      where: { locationId: locationId!, purpose: "POS" },
    });
    return privateJsonResponse({ message: "Guest payment integration removed" });
  }

  return privateJsonResponse({ error: "Unsupported provider action" }, { status: 400 });
}
