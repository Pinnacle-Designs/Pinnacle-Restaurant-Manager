"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Truck,
  Sparkles,
  FileText,
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  RefreshCw,
  Loader2,
  Camera,
  DollarSign,
} from "lucide-react";
import { Button, Badge, StatCard } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils";
import { InvoiceScanModal } from "./InvoiceScanModal";

interface PoSuggestion {
  inventoryItemId: string;
  name: string;
  vendor: string;
  unit: string;
  onHand: number;
  minQuantity: number;
  suggestedQty: number;
  unitPrice: number;
  lineTotal: number;
  reason: string;
}

interface PoLine {
  id: string;
  description: string;
  qtyOrdered: number;
  qtyReceived: number;
  unit: string;
  unitPrice: number;
  inventoryItemId: string | null;
}

interface PurchaseOrder {
  id: string;
  poNumber: string | null;
  vendor: string | null;
  status: string;
  source: string;
  totalAmount: number;
  matchStatus: string;
  submittedAt: string;
  lines: PoLine[];
  receipts: { id: string }[];
}

interface VendorInvoice {
  id: string;
  vendor: string;
  amount: number;
  invoiceNumber: string | null;
  matchStatus: string;
  matchNotes: string | null;
  invoiceDate: string;
  poId: string | null;
  receiptId: string | null;
}

interface VendorCredit {
  id: string;
  vendor: string;
  amount: number;
  reason: string;
  status: string;
  creditMemoNo: string | null;
  createdAt: string;
}

type Tab = "suggestions" | "orders" | "invoices" | "credits";

const MATCH_COLORS: Record<string, string> = {
  MATCHED: "bg-green-100 text-green-800",
  DISCREPANCY: "bg-red-100 text-red-800",
  PENDING: "bg-amber-100 text-amber-800",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUGGESTED: "bg-blue-100 text-blue-800",
  SUBMITTED: "bg-indigo-100 text-indigo-800",
  PARTIALLY_RECEIVED: "bg-amber-100 text-amber-800",
  RECEIVED: "bg-green-100 text-green-800",
};

export function LoadingDockClient() {
  const [tab, setTab] = useState<Tab>("suggestions");
  const [suggestions, setSuggestions] = useState<PoSuggestion[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [credits, setCredits] = useState<VendorCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingPo, setCreatingPo] = useState(false);
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanContext, setScanContext] = useState<{ poId?: string; receiptId?: string }>({});
  const [creditForm, setCreditForm] = useState({ vendor: "", amount: "", reason: "" });
  const [savingCredit, setSavingCredit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sugRes, ordRes, invRes, credRes] = await Promise.all([
        fetch("/api/purchasing/suggestions"),
        fetch("/api/purchasing/orders"),
        fetch("/api/purchasing/invoices/scan"),
        fetch("/api/purchasing/credits"),
      ]);
      const [sug, ord, inv, cred] = await Promise.all([
        sugRes.json(),
        ordRes.json(),
        invRes.json(),
        credRes.json(),
      ]);
      setSuggestions(sug.suggestions ?? []);
      setOrders(ord.orders ?? []);
      setInvoices(inv.invoices ?? []);
      setCredits(cred.credits ?? []);
    } catch {
      setError("Failed to load loading dock data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createPoFromSuggestions = async () => {
    if (suggestions.length === 0) return;
    setCreatingPo(true);
    setError(null);
    try {
      const lines = suggestions.slice(0, 12).map((s) => ({
        inventoryItemId: s.inventoryItemId,
        qty: s.suggestedQty,
        unitPrice: s.unitPrice,
      }));
      const res = await fetch("/api/purchasing/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, status: "SUBMITTED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create PO");
      await load();
      setTab("orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create PO");
    } finally {
      setCreatingPo(false);
    }
  };

  const receivePo = async (po: PurchaseOrder) => {
    setReceivingPoId(po.id);
    setError(null);
    try {
      const lines = po.lines
        .filter((l) => l.qtyReceived < l.qtyOrdered)
        .map((l) => ({
          poLineId: l.id,
          inventoryItemId: l.inventoryItemId ?? undefined,
          description: l.description,
          qtyReceived: l.qtyOrdered - l.qtyReceived,
          unit: l.unit,
          unitCost: l.unitPrice,
        }));
      if (lines.length === 0) {
        setError("All lines already received");
        return;
      }
      const res = await fetch("/api/purchasing/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poId: po.id, vendor: po.vendor, lines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Receive failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receive failed");
    } finally {
      setReceivingPoId(null);
    }
  };

  const openInvoiceScan = (po?: PurchaseOrder) => {
    setScanContext({
      poId: po?.id,
      receiptId: po?.receipts[0]?.id,
    });
    setScanOpen(true);
  };

  const saveCredit = async () => {
    const amount = parseFloat(creditForm.amount);
    if (!creditForm.vendor || !creditForm.reason || !Number.isFinite(amount)) {
      setError("Vendor, amount, and reason required");
      return;
    }
    setSavingCredit(true);
    try {
      const res = await fetch("/api/purchasing/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creditForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setCreditForm({ vendor: "", amount: "", reason: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credit");
    } finally {
      setSavingCredit(false);
    }
  };

  const resolveCredit = async (id: string, status: string) => {
    await fetch("/api/purchasing/credits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await load();
  };

  const discrepancyCount = invoices.filter((i) => i.matchStatus === "DISCREPANCY").length;
  const openCredits = credits.filter((c) => c.status === "OPEN");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "suggestions", label: "Auto-Order", icon: <Sparkles className="h-4 w-4" /> },
    { id: "orders", label: "POs & Receiving", icon: <PackageCheck className="h-4 w-4" /> },
    { id: "invoices", label: "Invoices & Match", icon: <FileText className="h-4 w-4" /> },
    { id: "credits", label: "Credits", icon: <DollarSign className="h-4 w-4" /> },
  ];

  return (
    <div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Suggested lines" value={suggestions.length} subtext="Predictive reorder" />
        <StatCard label="Open POs" value={orders.filter((o) => !["RECEIVED", "CANCELLED"].includes(o.status)).length} />
        <StatCard label="Match issues" value={discrepancyCount} subtext="Catch before you pay" />
        <StatCard label="Open credits" value={openCredits.length} subtext="Awaiting vendor memo" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-orange-100 text-orange-800" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={load} className="ml-auto">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && tab === "suggestions" ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      ) : (
        <>
          {tab === "suggestions" && (
            <div className="card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">Predictive Auto-Ordering</h2>
                  <p className="text-sm text-slate-500">
                    Based on sales velocity, current stock, and upcoming holidays
                  </p>
                </div>
                <Button onClick={createPoFromSuggestions} disabled={creatingPo || suggestions.length === 0}>
                  {creatingPo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                  Create PO from suggestions
                </Button>
              </div>
              {suggestions.length === 0 ? (
                <p className="py-8 text-center text-slate-500">Stock levels look healthy — no reorders suggested.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-slate-500">
                        <th className="pb-2 pr-4">Item</th>
                        <th className="pb-2 pr-4">Vendor</th>
                        <th className="pb-2 pr-4">On hand</th>
                        <th className="pb-2 pr-4">Order qty</th>
                        <th className="pb-2 pr-4">Est. cost</th>
                        <th className="pb-2">Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.map((s) => (
                        <tr key={s.inventoryItemId} className="border-b border-slate-100">
                          <td className="py-3 pr-4 font-medium">{s.name}</td>
                          <td className="py-3 pr-4 text-slate-600">{s.vendor}</td>
                          <td className="py-3 pr-4">
                            {s.onHand} {s.unit}
                          </td>
                          <td className="py-3 pr-4 text-orange-700">
                            {s.suggestedQty} {s.unit}
                          </td>
                          <td className="py-3 pr-4">{formatCurrency(s.lineTotal)}</td>
                          <td className="py-3 text-xs text-slate-500">{s.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "orders" && (
            <div className="space-y-4">
              {orders.length === 0 ? (
                <div className="card py-8 text-center text-slate-500">No purchase orders yet.</div>
              ) : (
                orders.map((po) => (
                  <div key={po.id} className="card">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {po.poNumber ?? po.id.slice(-8)} — {po.vendor ?? "Vendor"}
                        </p>
                        <p className="text-sm text-slate-500">
                          {formatCurrency(po.totalAmount)} · {new Date(po.submittedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={STATUS_COLORS[po.status] ?? "bg-slate-100"}>{po.status}</Badge>
                        <Badge className={MATCH_COLORS[po.matchStatus] ?? "bg-slate-100"}>{po.matchStatus}</Badge>
                      </div>
                    </div>
                    <div className="mb-3 space-y-1 text-sm">
                      {po.lines.map((l) => (
                        <div key={l.id} className="flex justify-between text-slate-600">
                          <span>{l.description}</span>
                          <span>
                            {l.qtyReceived}/{l.qtyOrdered} {l.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {po.status !== "RECEIVED" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => receivePo(po)}
                          disabled={receivingPoId === po.id}
                        >
                          {receivingPoId === po.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <PackageCheck className="mr-1 h-3 w-3" />
                          )}
                          Receive delivery
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openInvoiceScan(po)}>
                        <Camera className="mr-1 h-3 w-3" />
                        Scan invoice
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "invoices" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => openInvoiceScan()}>
                  <Camera className="mr-2 h-4 w-4" />
                  OCR invoice scan
                </Button>
              </div>
              {invoices.length === 0 ? (
                <div className="card py-8 text-center text-slate-500">
                  Scan a vendor invoice to digitize line items and run three-way matching.
                </div>
              ) : (
                invoices.map((inv) => {
                  let discrepancies: { description: string; severity: string }[] = [];
                  try {
                    if (inv.matchNotes) discrepancies = JSON.parse(inv.matchNotes);
                  } catch {
                    /* ignore */
                  }
                  return (
                    <div key={inv.id} className="card">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{inv.vendor}</p>
                          <p className="text-sm text-slate-500">
                            {inv.invoiceNumber ?? "No #"} · {formatCurrency(inv.amount)} ·{" "}
                            {new Date(inv.invoiceDate).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge className={MATCH_COLORS[inv.matchStatus] ?? "bg-slate-100"}>
                          {inv.matchStatus === "MATCHED" && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                          {inv.matchStatus === "DISCREPANCY" && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                          {inv.matchStatus}
                        </Badge>
                      </div>
                      {discrepancies.length > 0 && (
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                          <p className="mb-1 font-medium text-red-800">Three-way match flags</p>
                          <ul className="list-inside list-disc text-red-700">
                            {discrepancies.map((d, i) => (
                              <li key={i}>{d.description}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === "credits" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="card">
                <h2 className="mb-4 font-semibold">Log returned / damaged goods</h2>
                <div className="space-y-3">
                  <FormField label="Vendor">
                    <Input
                      value={creditForm.vendor}
                      onChange={(e) => setCreditForm({ ...creditForm, vendor: e.target.value })}
                      placeholder="Hill Country Meats"
                    />
                  </FormField>
                  <FormField label="Credit amount">
                    <Input
                      type="number"
                      step="0.01"
                      value={creditForm.amount}
                      onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Reason">
                    <Input
                      value={creditForm.reason}
                      onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })}
                      placeholder="Damaged cases refused at dock"
                    />
                  </FormField>
                  <Button onClick={saveCredit} disabled={savingCredit}>
                    {savingCredit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Log credit & alert bookkeeper
                  </Button>
                </div>
              </div>
              <div className="card">
                <h2 className="mb-4 font-semibold">Credit tracker</h2>
                {credits.length === 0 ? (
                  <p className="text-sm text-slate-500">No credits logged.</p>
                ) : (
                  <div className="space-y-3">
                    {credits.map((c) => (
                      <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex justify-between">
                          <span className="font-medium">{c.vendor}</span>
                          <span className="font-semibold text-orange-700">{formatCurrency(c.amount)}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{c.reason}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <Badge className={c.status === "OPEN" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}>
                            {c.status}
                          </Badge>
                          {c.status === "OPEN" && (
                            <Button size="sm" variant="ghost" onClick={() => resolveCredit(c.id, "APPLIED")}>
                              Mark memo received
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {scanOpen && (
        <InvoiceScanModal
          poId={scanContext.poId}
          receiptId={scanContext.receiptId}
          onSaved={() => {
            load();
            setTab("invoices");
          }}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}
