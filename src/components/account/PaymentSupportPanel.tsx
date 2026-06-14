"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, LifeBuoy, BookOpen, Mail } from "lucide-react";
import { Badge } from "@/components/ui";

interface SupportPayload {
  platform: {
    stripe: boolean;
    square: boolean;
    stripeConnect: boolean;
    appUrl: string;
  };
  connections: { subscription: string; pos: string };
  security: Array<{ title: string; detail: string }>;
  setup: {
    stripeSubscription: string[];
    squarePos: string[];
    stripeConnectPos: string[];
  };
  support: { email: string; docsUrl: string; webhookUrl: string };
  canManage: boolean;
}

export function PaymentSupportPanel() {
  const [data, setData] = useState<SupportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/billing/support")
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load support info"));
  }, []);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-slate-500">Loading payment support…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Payments & security</h2>
        <p className="mt-1 text-sm text-slate-500">
          How Pinnacle handles billing, integrations, and keeping card data safe.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-orange-600" />
          <h3 className="font-medium text-slate-900">Security practices</h3>
        </div>
        <ul className="mt-4 space-y-3">
          {data.security.map((item) => (
            <li key={item.title} className="text-sm">
              <p className="font-medium text-slate-800">{item.title}</p>
              <p className="mt-0.5 text-slate-600">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-orange-600" />
          <h3 className="font-medium text-slate-900">Integration status</h3>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge className={data.platform.stripe ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}>
            Stripe {data.platform.stripe ? "configured" : "not configured"}
          </Badge>
          <Badge className={data.platform.square ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}>
            Square {data.platform.square ? "configured" : "not configured"}
          </Badge>
          <Badge
            className={
              data.platform.stripeConnect
                ? "bg-green-100 text-green-800"
                : "bg-slate-100 text-slate-600"
            }
          >
            Stripe Connect {data.platform.stripeConnect ? "configured" : "not configured"}
          </Badge>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Your subscription: <strong>{data.connections.subscription}</strong> · Guest payments:{" "}
          <strong>{data.connections.pos}</strong>
        </p>
        {data.canManage && (
          <p className="mt-2 text-sm text-slate-500">
            Webhook URL for Stripe:{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{data.support.webhookUrl}</code>
          </p>
        )}
      </div>

      {data.canManage && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-orange-600" />
            <h3 className="font-medium text-slate-900">Setup guides</h3>
          </div>

          <div className="mt-4 space-y-4">
            <SetupList title="Stripe subscription autopay" steps={data.setup.stripeSubscription} />
            <SetupList title="Square guest payments" steps={data.setup.squarePos} />
            <SetupList title="Stripe Connect guest payments" steps={data.setup.stripeConnectPos} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-orange-600" />
          <h3 className="font-medium text-slate-900">Need help?</h3>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Email{" "}
          <a href={`mailto:${data.support.email}`} className="font-medium text-orange-600 hover:text-orange-500">
            {data.support.email}
          </a>{" "}
          for billing or integration issues. Compare plans on the{" "}
          <Link href={data.support.docsUrl} className="font-medium text-orange-600 hover:text-orange-500">
            pricing page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function SetupList({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
