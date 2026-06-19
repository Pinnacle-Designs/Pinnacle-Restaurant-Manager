import type { PaymentProviderConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProviderOption } from "./types";
import { kindToPosId, kindToSubscriptionId } from "./types";
import { decryptCredential } from "@/lib/credential-crypto";

export { kindToPosId, kindToSubscriptionId };

export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function squareConfigured(): boolean {
  return Boolean(
    process.env.SQUARE_APPLICATION_ID?.trim() &&
      process.env.SQUARE_APPLICATION_SECRET?.trim()
  );
}

export function stripeConnectConfigured(): boolean {
  return stripeConfigured() && Boolean(process.env.STRIPE_CONNECT_CLIENT_ID?.trim());
}

export async function getProviderConnections(locationId: string) {
  return prisma.paymentProviderConnection.findMany({
    where: { locationId },
  });
}

export async function getProviderConnection(
  locationId: string,
  purpose: PaymentProviderConnection["purpose"]
) {
  return prisma.paymentProviderConnection.findUnique({
    where: { locationId_purpose: { locationId, purpose } },
  });
}

/** Decrypt stored OAuth refresh token or other provider credential. */
export function readConnectionCredential(
  connection: Pick<PaymentProviderConnection, "credential"> | null | undefined
): string | null {
  return decryptCredential(connection?.credential ?? null);
}

function parseMetadata(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function buildProviderOptions(
  connections: PaymentProviderConnection[]
): ProviderOption[] {
  const sub = connections.find((c) => c.purpose === "SUBSCRIPTION");
  const pos = connections.find((c) => c.purpose === "POS");

  const options: ProviderOption[] = [
    {
      id: "stripe-subscription",
      name: "Stripe",
      description: "Secure subscription billing with Stripe Checkout and Customer Portal.",
      purpose: "SUBSCRIPTION",
      configured: stripeConfigured(),
      connected: sub?.provider === "STRIPE" && sub.status === "connected",
      accountLabel: sub?.accountId ? `Customer ${sub.accountId.slice(-8)}` : null,
      status: sub?.status ?? null,
    },
    {
      id: "manual-subscription",
      name: "Manual entry",
      description: "Store card last-four only (demo). Use Stripe in production.",
      purpose: "SUBSCRIPTION",
      configured: true,
      connected: !sub || sub.provider === "MANUAL",
      accountLabel: null,
      status: sub?.status ?? "manual",
    },
    {
      id: "stripe-pos",
      name: "Stripe",
      description: "Accept in-restaurant card payments via Stripe Connect.",
      purpose: "POS",
      configured: stripeConnectConfigured(),
      connected: pos?.provider === "STRIPE" && pos.status === "connected",
      accountLabel: pos?.accountId ? `Account ${pos.accountId.slice(-8)}` : null,
      status: pos?.status ?? null,
    },
    {
      id: "square-pos",
      name: "Square",
      description: "Connect Square to sync card payments from your registers.",
      purpose: "POS",
      configured: squareConfigured(),
      connected: pos?.provider === "SQUARE" && pos.status === "connected",
      accountLabel: pos?.accountId ? `Merchant ${pos.accountId.slice(-8)}` : null,
      status: pos?.status ?? null,
    },
  ];

  return options;
}

export function safeConnectionView(connection: PaymentProviderConnection | null) {
  if (!connection) return null;
  const metadata = parseMetadata(connection.metadata);
  return {
    provider: connection.provider,
    purpose: connection.purpose,
    status: connection.status,
    accountLabel: connection.accountId
      ? `${connection.provider} ····${connection.accountId.slice(-4)}`
      : null,
    connectedAt: connection.connectedAt.toISOString(),
    brand: metadata.brand ?? null,
    last4: metadata.last4 ?? null,
    expMonth: metadata.expMonth ? Number(metadata.expMonth) : null,
    expYear: metadata.expYear ? Number(metadata.expYear) : null,
    nextBillingDate: metadata.nextBillingDate ?? null,
  };
}
