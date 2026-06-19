"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Link2,
  RefreshCw,
  ShoppingCart,
  Unplug,
  Zap,
} from "lucide-react";
import { Button, Badge, ScrollableTabs, TabPill } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { IntegrationMarketplace } from "@/components/account/IntegrationMarketplace";

interface IntegrationsPayload {
  canManage: boolean;
  posSync: {
    enabled: boolean;
    lastSyncAt: string | null;
    depletionsToday: number;
  };
  accounting: {
    providers: Array<{
      id: string;
      name: string;
      description: string;
      connected: boolean;
      companyName: string | null;
      autoSyncEnabled: boolean;
      lastSyncAt: string | null;
      entriesSynced: number;
      lastSyncStatus: string | null;
      lastSyncMessage: string | null;
    }>;
    recentEntries: Array<{
      id: string;
      provider: string;
      entryType: string;
      reference: string;
      description: string;
      debit: number;
      credit: number;
      syncedAt: string;
    }>;
    creditMemoLocks?: {
      openCredits: number;
      openCreditTotal: number;
      lockedInvoices: number;
      lockedExposure: number;
      invoices: Array<{ vendor: string; invoiceNumber: string | null; amount: number; reason: string | null }>;
    };
  };
  vendorEdi: {
    providers: Array<{
      id: string;
      name: string;
      description: string;
      connected: boolean;
      accountNumber: string | null;
      warehouseCode: string | null;
      catalogItems: number;
      outOfStock: number;
      lastCatalogSyncAt: string | null;
      lastOrderAt: string | null;
      lastSyncStatus: string | null;
    }>;
    recentOrders: Array<{
      id: string;
      provider: string;
      status: string;
      lineCount: number;
      totalAmount: number;
      submittedAt: string;
    }>;
  };
}

export function IntegrationsPanel() {
  const [view, setView] = useState<"connected" | "marketplace">("connected");
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/integrations");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load integrations");
      setData(json);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const postAction = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/account/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      setMessage(json.message || "Done");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const togglePosSync = async (enabled: boolean) => {
    setBusy("pos-toggle");
    setMessage(null);
    try {
      const res = await fetch("/api/account/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posSyncEnabled: enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update POS sync");
      setMessage(json.message);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update POS sync");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading integrations…</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-600">{message || "Integrations unavailable"}</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">The nervous system</h2>
        <p className="mt-1 text-sm text-slate-600">
          Connect POS, accounting, vendors, and 280+ restaurant systems — data flows automatically, no re-keying.
        </p>
      </div>

      <ScrollableTabs className="border-b border-slate-200 pb-2" menuLabel="Integrations">
        <TabPill active={view === "connected"} onClick={() => setView("connected")}>
          Connected
        </TabPill>
        <TabPill active={view === "marketplace"} onClick={() => setView("marketplace")}>
          Marketplace (280+)
        </TabPill>
      </ScrollableTabs>

      {view === "marketplace" ? (
        <IntegrationMarketplace canManage={data.canManage} onNativeConnect={postAction} />
      ) : (
        <>

      {message && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      {/* POS sync */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-orange-100 p-2 text-orange-700">
            <Zap className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Real-time POS sync</h3>
            <p className="mt-1 text-sm text-slate-600">
              Deducts recipe ingredients the instant a ticket is fired to the kitchen — inventory
              stays aligned with what&apos;s actually cooking.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <Badge className={data.posSync.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}>
                {data.posSync.enabled ? "Active" : "Paused"}
              </Badge>
              <span className="text-slate-500">
                {data.posSync.depletionsToday} depletions today
              </span>
              {data.posSync.lastSyncAt && (
                <span className="text-slate-500">
                  Last fire: {new Date(data.posSync.lastSyncAt).toLocaleString()}
                </span>
              )}
            </div>
            {data.canManage && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                disabled={busy === "pos-toggle"}
                onClick={() => void togglePosSync(!data.posSync.enabled)}
              >
                {data.posSync.enabled ? "Pause POS sync" : "Enable POS sync"}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Accounting */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Accounting auto-sync</h3>
            <p className="mt-1 text-sm text-slate-600">
              Push invoices, credits, expenses, and inventory valuations as clean journal entries to
              QuickBooks, Xero, or Sage. Invoices with pending vendor credits are <strong>blocked from sync</strong> until memos are applied.
            </p>
            {data.accounting.creditMemoLocks && data.accounting.creditMemoLocks.lockedInvoices > 0 && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <strong>{data.accounting.creditMemoLocks.lockedInvoices} invoice(s) locked</strong> —{" "}
                {formatCurrency(data.accounting.creditMemoLocks.lockedExposure)} held pending{" "}
                {data.accounting.creditMemoLocks.openCredits} open credit memo(s).
              </p>
            )}
            <div className="mt-4 space-y-3">
              {data.accounting.providers.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.description}</p>
                    {p.connected && p.companyName && (
                      <p className="mt-1 text-xs text-slate-600">{p.companyName}</p>
                    )}
                    {p.connected && p.lastSyncMessage && (
                      <p className="mt-1 text-xs text-emerald-700">{p.lastSyncMessage}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={
                        p.connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                      }
                    >
                      {p.connected ? "Connected" : "Not connected"}
                    </Badge>
                    {data.canManage && (
                      <>
                        {p.connected ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy === `sync-${p.id}`}
                              onClick={() =>
                                void postAction("accounting_sync", { provider: p.id })
                              }
                            >
                              <RefreshCw className="mr-1 h-3.5 w-3.5" />
                              Sync now
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy === `disc-${p.id}`}
                              onClick={() =>
                                void postAction("accounting_disconnect", { provider: p.id })
                              }
                            >
                              <Unplug className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busy === `conn-${p.id}`}
                            onClick={() =>
                              void postAction("accounting_connect", { provider: p.id })
                            }
                          >
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                            Connect
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {data.accounting.recentEntries.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Recent journal entries
                </p>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {data.accounting.recentEntries.slice(0, 5).map((e) => (
                    <li key={e.id} className="flex justify-between gap-4 py-2">
                      <span className="text-slate-700">
                        {e.reference} — {e.description}
                      </span>
                      <span className="shrink-0 text-slate-500">
                        {e.debit > 0 ? formatCurrency(e.debit) : formatCurrency(e.credit)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Vendor EDI */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Vendor EDI</h3>
            <p className="mt-1 text-sm text-slate-600">
              Pull live catalogs from Sysco and US Foods, track warehouse out-of-stocks, and submit
              purchase orders directly.
            </p>
            <div className="mt-4 space-y-3">
              {data.vendorEdi.providers.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.description}</p>
                    {p.connected && (
                      <p className="mt-1 text-xs text-slate-600">
                        {p.catalogItems} catalog items
                        {p.outOfStock > 0 && (
                          <span className="text-amber-700"> · {p.outOfStock} out of stock</span>
                        )}
                        {p.warehouseCode && ` · ${p.warehouseCode}`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={
                        p.connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                      }
                    >
                      {p.connected ? "Connected" : "Not connected"}
                    </Badge>
                    {data.canManage && (
                      <>
                        {p.connected ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy === `cat-${p.id}`}
                              onClick={() =>
                                void postAction("vendor_sync_catalog", { provider: p.id })
                              }
                            >
                              <RefreshCw className="mr-1 h-3.5 w-3.5" />
                              Sync catalog
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={busy === `order-${p.id}`}
                              onClick={() =>
                                void postAction("vendor_submit_order", { provider: p.id })
                              }
                            >
                              Submit PO
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy === `vdisc-${p.id}`}
                              onClick={() =>
                                void postAction("vendor_disconnect", { provider: p.id })
                              }
                            >
                              <Unplug className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busy === `vconn-${p.id}`}
                            onClick={() => void postAction("vendor_connect", { provider: p.id })}
                          >
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                            Connect
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {data.vendorEdi.recentOrders.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Recent purchase orders
                </p>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {data.vendorEdi.recentOrders.map((o) => (
                    <li key={o.id} className="flex justify-between gap-4 py-2">
                      <span className="text-slate-700">
                        {o.provider} — {o.lineCount} lines ({o.status})
                      </span>
                      <span className="shrink-0 text-slate-500">
                        {formatCurrency(o.totalAmount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {!data.canManage && (
        <p className={cn("text-sm text-slate-500")}>
          Only the location owner can connect or sync integrations.
        </p>
      )}
        </>
      )}
    </div>
  );
}
