"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Link2, Unplug } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";

interface ProviderConnection {
  provider: string;
  purpose: string;
  status: string;
  accountLabel: string | null;
  connectedAt: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  nextBillingDate: string | null;
}

interface ProvidersPayload {
  platform: { stripe: boolean; square: boolean; stripeConnect: boolean };
  providers: Array<{
    id: string;
    name: string;
    description: string;
    purpose: string;
    configured: boolean;
    connected: boolean;
    accountLabel: string | null;
    status: string | null;
  }>;
  subscription: ProviderConnection | null;
  pos: ProviderConnection | null;
  canManage: boolean;
}

interface BillingIntegrationsProps {
  planName: string;
  monthlyAmount: number;
  canManage: boolean;
  subscriptionProvider: "manual" | "stripe";
  posProvider: "none" | "stripe" | "square";
  onRefresh: () => Promise<void>;
}

export function BillingIntegrations({
  planName,
  monthlyAmount,
  canManage,
  subscriptionProvider,
  posProvider,
  onRefresh,
}: BillingIntegrationsProps) {
  const [providers, setProviders] = useState<ProvidersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/billing/providers");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load payment providers");
      setProviders(json);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load payment providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const openUrl = async (url: string) => {
    window.location.assign(url);
  };

  const startStripeCheckout = async () => {
    setBusy("stripe-checkout");
    setMessage(null);
    try {
      const res = await fetch("/api/account/billing/stripe/checkout", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not start Stripe checkout");
      if (json.url) await openUrl(json.url);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start Stripe checkout");
    } finally {
      setBusy(null);
    }
  };

  const openStripePortal = async () => {
    setBusy("stripe-portal");
    setMessage(null);
    try {
      const res = await fetch("/api/account/billing/stripe/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not open billing portal");
      if (json.url) await openUrl(json.url);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not open billing portal");
    } finally {
      setBusy(null);
    }
  };

  const connectOAuth = async (path: string, key: string) => {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch(path);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not start connection");
      if (json.url) await openUrl(json.url);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start connection");
    } finally {
      setBusy(null);
    }
  };

  const switchToManual = async () => {
    setBusy("manual");
    setMessage(null);
    try {
      const res = await fetch("/api/account/billing/providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "manual" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not switch provider");
      setMessage("Manual billing entry enabled");
      await loadProviders();
      await onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not switch provider");
    } finally {
      setBusy(null);
    }
  };

  const disconnectPos = async () => {
    if (!window.confirm("Disconnect your guest payment integration?")) return;
    setBusy("disconnect-pos");
    setMessage(null);
    try {
      const res = await fetch("/api/account/billing/providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "disconnect-pos" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not disconnect");
      setMessage("Guest payment integration removed");
      await loadProviders();
      await onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not disconnect");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <p className="mt-6 text-sm text-slate-500">Loading payment integrations…</p>;
  }

  const stripeSub = providers?.providers.find((p) => p.id === "stripe-subscription");
  const stripePos = providers?.providers.find((p) => p.id === "stripe-pos");
  const squarePos = providers?.providers.find((p) => p.id === "square-pos");

  return (
    <div className="mt-8 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Payment integrations</h3>
        <p className="mt-1 text-sm text-slate-500">
          Connect a processor for PCI-compliant billing. Card data never touches Pinnacle servers
          when using Stripe or Square.
        </p>
      </div>

      {message && (
        <p
          className={cn(
            "text-sm",
            message.includes("enabled") || message.includes("removed")
              ? "text-green-700"
              : "text-red-600"
          )}
        >
          {message}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-slate-900">Subscription autopay</p>
            <p className="mt-1 text-sm text-slate-500">
              {planName} — {formatCurrency(monthlyAmount)}/mo
            </p>
          </div>
          <Badge
            className={
              subscriptionProvider === "stripe"
                ? "bg-green-100 text-green-800"
                : "bg-slate-100 text-slate-700"
            }
          >
            {subscriptionProvider === "stripe" ? "Stripe" : "Manual"}
          </Badge>
        </div>

        {subscriptionProvider === "stripe" && providers?.subscription && (
          <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p>
              {providers.subscription.brand && providers.subscription.last4
                ? `${providers.subscription.brand} •••• ${providers.subscription.last4}`
                : "Payment method on file"}
            </p>
            {providers.subscription.nextBillingDate && (
              <p className="mt-1 text-slate-500">
                Next billing:{" "}
                {new Date(providers.subscription.nextBillingDate).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            {stripeSub?.configured ? (
              subscriptionProvider === "stripe" ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void openStripePortal()}
                >
                  <CreditCard className="h-4 w-4" />
                  {busy === "stripe-portal" ? "Opening…" : "Manage billing in Stripe"}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void startStripeCheckout()}
                >
                  <Link2 className="h-4 w-4" />
                  {busy === "stripe-checkout" ? "Redirecting…" : "Set up autopay with Stripe"}
                </Button>
              )
            ) : (
              <p className="text-sm text-amber-700">
                Stripe is not configured on this server. Add STRIPE_SECRET_KEY to enable hosted
                checkout.
              </p>
            )}
            {subscriptionProvider === "stripe" && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void switchToManual()}
              >
                Use manual entry
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-slate-900">Guest payments (POS)</p>
            <p className="mt-1 text-sm text-slate-500">
              Connect Square or Stripe to route in-restaurant card payments through your processor.
            </p>
          </div>
          <Badge
            className={
              posProvider === "none"
                ? "bg-slate-100 text-slate-700"
                : "bg-green-100 text-green-800"
            }
          >
            {posProvider === "none"
              ? "Not connected"
              : posProvider === "square"
                ? "Square"
                : "Stripe"}
          </Badge>
        </div>

        {providers?.pos?.accountLabel && (
          <p className="mt-3 text-sm text-slate-600">{providers.pos.accountLabel}</p>
        )}

        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            {squarePos?.configured && posProvider !== "square" && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy !== null || posProvider === "stripe"}
                onClick={() =>
                  void connectOAuth("/api/account/billing/square/connect", "square")
                }
              >
                <Link2 className="h-4 w-4" />
                {busy === "square" ? "Redirecting…" : "Connect Square"}
              </Button>
            )}
            {stripePos?.configured && posProvider !== "stripe" && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy !== null || posProvider === "square"}
                onClick={() =>
                  void connectOAuth(
                    "/api/account/billing/stripe/connect",
                    "stripe-connect"
                  )
                }
              >
                <Link2 className="h-4 w-4" />
                {busy === "stripe-connect" ? "Redirecting…" : "Connect Stripe"}
              </Button>
            )}
            {!squarePos?.configured && !stripePos?.configured && (
              <p className="text-sm text-slate-500">
                Add Square or Stripe Connect credentials to enable POS integrations.
              </p>
            )}
            {posProvider !== "none" && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void disconnectPos()}
              >
                <Unplug className="h-4 w-4" />
                Disconnect
              </Button>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-slate-500">
        Security details and setup guides:{" "}
        <a href="/account?tab=support" className="font-medium text-orange-600 hover:text-orange-500">
          Payments & support
        </a>
      </p>
    </div>
  );
}
