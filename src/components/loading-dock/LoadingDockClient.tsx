"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Building2,
  Link2,
  ClipboardList,
  Scale,
  Send,
  ShieldCheck,
  Star,
} from "lucide-react";
import Link from "next/link";
import { Button, Badge, StatCard, ScrollableTabs, TabPill } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils";
import { InvoiceScanModal } from "./InvoiceScanModal";
import { ThreeWayMatchPanel } from "./ThreeWayMatchPanel";
import { CreditMemoModal } from "./CreditMemoModal";
import { VendorScorecardsPanel, type VendorScorecardRow } from "./VendorScorecardsPanel";
import {
  derivePoPaymentStatus,
  getPoReceivingGroup,
  paymentStatusDetail,
  PO_PAYMENT_COLORS,
  PO_PAYMENT_LABELS,
  type PoPaymentStatus,
} from "@/lib/purchasing/po-receiving-status";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";

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
  invoices?: Array<{
    id: string;
    vendor: string;
    amount: number;
    invoiceNumber: string | null;
    matchStatus: string;
    matchNotes: string | null;
    accountingSyncLocked?: boolean;
    paymentHoldReason?: string | null;
    paidAt?: string | null;
  }>;
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
  imageUrl?: string | null;
}

interface VendorCredit {
  id: string;
  vendor: string;
  amount: number;
  reason: string;
  status: string;
  category: string | null;
  creditMemoNo: string | null;
  photoUrl: string | null;
  repEmail: string | null;
  emailStatus: string | null;
  emailSentAt: string | null;
  accountingLocked: boolean;
  invoiceId: string | null;
  createdAt: string;
}

interface VendorSummary {
  name: string;
  kind: "supplier" | "edi";
  ediProvider?: string;
  itemCount: number;
  lowStockCount: number;
  openPoCount: number;
  openPoTotal: number;
  suggestedLineCount: number;
  suggestedTotal: number;
  openCreditCount: number;
  openCreditTotal: number;
  spentLast90Days: number;
  connected?: boolean;
  accountNumber?: string | null;
  warehouseCode?: string | null;
  catalogItems?: number;
  outOfStock?: number;
  lastCatalogSyncAt?: string | null;
  lastOrderAt?: string | null;
  lastSyncStatus?: string | null;
}

interface VendorBidLine {
  inventoryItemId: string;
  itemName: string;
  unit: string;
  currentVendor: string | null;
  currentPrice: number;
  suggestedQty: number;
  vendors: Array<{ vendor: string; unitPrice: number; source: string; inStock?: boolean }>;
  recommendedVendor: string;
  recommendedPrice: number;
  savingsAmount: number;
  savingsPct: number;
}

type Tab = "drafts" | "bidding" | "vendors" | "scorecards" | "suggestions" | "orders" | "invoices" | "credits";

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
  const [tab, setTab] = useState<Tab>("drafts");
  const [suggestions, setSuggestions] = useState<PoSuggestion[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [credits, setCredits] = useState<VendorCredit[]>([]);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [bids, setBids] = useState<VendorBidLine[]>([]);
  const [bidSavings, setBidSavings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creatingPo, setCreatingPo] = useState(false);
  const [creatingPoVendor, setCreatingPoVendor] = useState<string | null>(null);
  const [buildingDrafts, setBuildingDrafts] = useState(false);
  const [approvingPoId, setApprovingPoId] = useState<string | null>(null);
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanContext, setScanContext] = useState<{ poId?: string; receiptId?: string }>({});
  const [creditForm, setCreditForm] = useState({ vendor: "", amount: "", reason: "" });
  const [savingCredit, setSavingCredit] = useState(false);
  const [creditMemoOpen, setCreditMemoOpen] = useState(false);
  const [creditSaveNote, setCreditSaveNote] = useState<string | null>(null);
  const [scorecards, setScorecards] = useState<VendorScorecardRow[]>([]);
  const [scorecardSummary, setScorecardSummary] = useState<{
    avgFillRate: number;
    avgOnTime: number;
    avgSubstitutionRate: number;
    vendorCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sugRes, ordRes, invRes, credRes, venRes, bidRes, scRes] = await Promise.all([
        fetch("/api/purchasing/suggestions"),
        fetch("/api/purchasing/orders"),
        fetch("/api/purchasing/invoices/scan"),
        fetch("/api/purchasing/credits"),
        fetch("/api/purchasing/vendors"),
        fetch("/api/purchasing/bidding"),
        fetch("/api/purchasing/scorecards"),
      ]);
      const [sug, ord, inv, cred, ven, bid, sc] = await Promise.all([
        sugRes.json(),
        ordRes.json(),
        invRes.json(),
        credRes.json(),
        venRes.json(),
        bidRes.json(),
        scRes.json(),
      ]);
      setSuggestions(sug.suggestions ?? []);
      setOrders(ord.orders ?? []);
      setInvoices(inv.invoices ?? []);
      setCredits(cred.credits ?? []);
      setVendors(ven.vendors ?? []);
      setBids(bid.bids ?? []);
      setBidSavings(bid.estimatedWeeklySavings ?? 0);
      setScorecards(sc.scorecards ?? []);
      setScorecardSummary(
        sc.vendorCount != null
          ? {
              avgFillRate: sc.avgFillRate ?? 100,
              avgOnTime: sc.avgOnTime ?? 100,
              avgSubstitutionRate: sc.avgSubstitutionRate ?? 0,
              vendorCount: sc.vendorCount ?? 0,
            }
          : null
      );
    } catch {
      setError("Failed to load purchase order data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createPoFromLines = async (
    lines: { inventoryItemId: string; qty: number; unitPrice: number }[],
    vendor?: string
  ) => {
    const res = await fetch("/api/purchasing/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, vendor, status: "SUBMITTED" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create PO");
    await load();
    setTab("orders");
  };

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
      await createPoFromLines(lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create PO");
    } finally {
      setCreatingPo(false);
    }
  };

  const createPoForVendor = async (vendorName: string) => {
    const vendorLines = suggestions.filter((s) => s.vendor === vendorName);
    if (vendorLines.length === 0) return;
    setCreatingPoVendor(vendorName);
    setError(null);
    try {
      const lines = vendorLines.map((s) => ({
        inventoryItemId: s.inventoryItemId,
        qty: s.suggestedQty,
        unitPrice: s.unitPrice,
      }));
      await createPoFromLines(lines, vendorName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create PO");
    } finally {
      setCreatingPoVendor(null);
    }
  };

  const buildDraftPos = async () => {
    setBuildingDrafts(true);
    setError(null);
    try {
      const res = await fetch("/api/purchasing/drafts", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to build drafts");
      await load();
      setTab("drafts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build draft POs");
    } finally {
      setBuildingDrafts(false);
    }
  };

  const approveAndTransmit = async (poId: string) => {
    setApprovingPoId(poId);
    setError(null);
    try {
      const res = await fetch(`/api/purchasing/orders/${poId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transmit failed");
      await load();
      setTab("orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setApprovingPoId(null);
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

  const openCreditInvoiceIds = useMemo(
    () => new Set(openCredits.map((c) => c.invoiceId).filter((id): id is string => Boolean(id))),
    [openCredits]
  );

  const { pendingReceivingPos, receivedPos } = useMemo(() => {
    const pending: PurchaseOrder[] = [];
    const received: PurchaseOrder[] = [];
    for (const po of orders) {
      const group = getPoReceivingGroup(po.status);
      if (group === "pending") pending.push(po);
      else if (group === "received") received.push(po);
    }
    return { pendingReceivingPos: pending, receivedPos: received };
  }, [orders]);

  const supplierVendors = vendors.filter((v) => v.kind === "supplier");
  const ediVendors = vendors.filter((v) => v.kind === "edi");
  const draftOrders = orders.filter((o) => o.status === "DRAFT");
  const multiVendorBids = bids.filter((b) => b.vendors.length >= 2);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "drafts", label: "Smart POs", icon: <ClipboardList className="h-4 w-4" /> },
    { id: "bidding", label: "Vendor Bidding", icon: <Scale className="h-4 w-4" /> },
    { id: "vendors", label: "Vendors", icon: <Building2 className="h-4 w-4" /> },
    { id: "scorecards", label: "Scorecards", icon: <Star className="h-4 w-4" /> },
    { id: "suggestions", label: "Auto-Order", icon: <Sparkles className="h-4 w-4" /> },
    { id: "orders", label: "POs & Receiving", icon: <PackageCheck className="h-4 w-4" /> },
    { id: "invoices", label: "Three-Way Match", icon: <ShieldCheck className="h-4 w-4" /> },
    { id: "credits", label: "Credits", icon: <DollarSign className="h-4 w-4" /> },
  ];

  return (
    <div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Draft POs" value={draftOrders.length} subtext="Review & approve" />
        <StatCard label="Bid savings" value={formatCurrency(bidSavings)} subtext="Est. this week" />
        <StatCard label="Active vendors" value={supplierVendors.length} subtext={`${ediVendors.filter((v) => v.connected).length} EDI`} />
        <StatCard label="Suggested lines" value={suggestions.length} subtext="Par + forecast" />
        <StatCard label="Open POs" value={orders.filter((o) => !["RECEIVED", "CANCELLED", "DRAFT"].includes(o.status)).length} />
        <StatCard label="Match issues" value={discrepancyCount} subtext="Hold payment" />
      </div>

      <div className="mb-4 flex items-start gap-2 border-b border-slate-200 pb-2">
        <ScrollableTabs className="min-w-0 flex-1" menuLabel="Loading dock">
          {tabs.map((t) => (
            <TabPill key={t.id} id={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.icon}
              {t.label}
            </TabPill>
          ))}
        </ScrollableTabs>
        <Button variant="ghost" size="sm" onClick={load} className="hidden shrink-0 sm:inline-flex">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && ["suggestions", "vendors", "drafts", "bidding"].includes(tab) ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      ) : (
        <>
          {tab === "drafts" && (
            <PageSectionShell pageId="loading-dock-drafts">
              <PageSection
                id="smart-pos"
                title="Smart purchase orders"
                description="Auto-built per vendor from par levels, sales velocity, holiday forecasts, and winning bid prices"
                defaultOpen
                headerActions={
                  <Button onClick={buildDraftPos} disabled={buildingDrafts} size="sm">
                    {buildingDrafts ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Build draft POs by vendor
                  </Button>
                }
              >
                {draftOrders.length === 0 ? (
                  <p className="py-6 text-center text-slate-500">
                    No draft POs yet. Click above to generate one draft per vendor — then review and approve to email or EDI transmit.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {draftOrders.map((po) => (
                      <div key={po.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {po.poNumber ?? po.id.slice(-8)} — {po.vendor ?? "Vendor"}
                            </p>
                            <p className="text-sm text-slate-500">
                              {po.lines.length} lines · {formatCurrency(po.totalAmount)} · {po.source}
                            </p>
                          </div>
                          <Badge className={STATUS_COLORS.DRAFT}>DRAFT</Badge>
                        </div>
                        <div className="mb-3 max-h-40 space-y-1 overflow-y-auto text-sm">
                          {po.lines.map((l) => (
                            <div key={l.id} className="flex justify-between text-slate-600">
                              <span>{l.description}</span>
                              <span>
                                {l.qtyOrdered} {l.unit} @ {formatCurrency(l.unitPrice)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <Button size="sm" onClick={() => approveAndTransmit(po.id)} disabled={approvingPoId === po.id}>
                          {approvingPoId === po.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          Approve &amp; transmit
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </PageSection>
            </PageSectionShell>
          )}

          {tab === "bidding" && (
            <PageSectionShell pageId="loading-dock-bidding">
              <PageSection
                id="vendor-bidding"
                title="Cross-vendor price comparison"
                description="Compares vendor quotes, EDI catalog pricing, and invoice history — recommends the lowest in-stock vendor each week"
                defaultOpen
              >
                {multiVendorBids.length > 0 && (
                  <p className="mb-4 text-sm font-medium text-green-700">
                    {multiVendorBids.length} items bid across vendors · est. weekly savings {formatCurrency(bidSavings)}
                  </p>
                )}
                {multiVendorBids.length === 0 ? (
                  <p className="py-8 text-center text-slate-500">
                    Need 2+ vendor quotes per item. Seed data includes produce bidding — or add vendor price history and connect EDI catalogs.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-slate-500">
                          <th className="pb-2 pr-4">Item</th>
                          <th className="pb-2 pr-4">Vendor quotes</th>
                          <th className="pb-2 pr-4">Winner</th>
                          <th className="pb-2">Savings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {multiVendorBids.map((b) => (
                          <tr key={b.inventoryItemId} className="border-b border-slate-100">
                            <td className="py-3 pr-4 font-medium">{b.itemName}</td>
                            <td className="py-3 pr-4 text-xs text-slate-600">
                              {b.vendors.map((v) => (
                                <span
                                  key={v.vendor}
                                  className={`mr-2 inline-block rounded px-1.5 py-0.5 ${
                                    v.vendor === b.recommendedVendor
                                      ? "bg-green-100 text-green-800"
                                      : "bg-slate-100"
                                  }`}
                                >
                                  {v.vendor} {formatCurrency(v.unitPrice)}
                                </span>
                              ))}
                            </td>
                            <td className="py-3 pr-4 text-orange-700">{b.recommendedVendor}</td>
                            <td className="py-3">
                              {b.savingsPct > 0 ? (
                                <span className="text-green-700">{b.savingsPct.toFixed(0)}%</span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </PageSection>
            </PageSectionShell>
          )}

          {tab === "scorecards" && (
            <PageSectionShell pageId="loading-dock-scorecards">
              <PageSection id="vendor-scorecards" title="Vendor scorecards" defaultOpen>
                <VendorScorecardsPanel
                  scorecards={scorecards}
                  summary={scorecardSummary}
                  loading={loading}
                />
              </PageSection>
            </PageSectionShell>
          )}

          {tab === "vendors" && (
            <PageSectionShell pageId="loading-dock-vendors">
              {ediVendors.length > 0 && (
                <PageSection
                  id="edi-vendors"
                  title="EDI distributors"
                  description="Sysco, US Foods, and Gordon Food Service — live catalog sync and EDI PO transmission"
                  defaultOpen
                  headerActions={
                    <Link
                      href="/account?tab=integrations"
                      className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:text-orange-800"
                    >
                      <Link2 className="h-4 w-4" />
                      Manage in Integrations
                    </Link>
                  }
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    {ediVendors.map((v) => (
                      <div key={v.name} className="rounded-xl border border-orange-100 bg-white p-4">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">{v.name}</p>
                            <p className="text-sm text-slate-500">
                              {v.connected
                                ? `Account ${v.accountNumber ?? "—"} · ${v.warehouseCode ?? "warehouse"}`
                                : "Not connected — link in Account → Integrations"}
                            </p>
                          </div>
                          <Badge className={v.connected ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}>
                            {v.connected ? "EDI live" : "Offline"}
                          </Badge>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <dt className="text-slate-500">Catalog items</dt>
                            <dd className="font-medium">{v.catalogItems ?? 0}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Out of stock</dt>
                            <dd className={`font-medium ${(v.outOfStock ?? 0) > 0 ? "text-amber-700" : ""}`}>
                              {v.outOfStock ?? 0}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Open POs</dt>
                            <dd className="font-medium">
                              {v.openPoCount} · {formatCurrency(v.openPoTotal)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">90-day spend</dt>
                            <dd className="font-medium">{formatCurrency(v.spentLast90Days)}</dd>
                          </div>
                        </dl>
                        {v.lastOrderAt && (
                          <p className="mt-3 text-xs text-slate-500">
                            Last order {new Date(v.lastOrderAt).toLocaleDateString()}
                            {v.lastSyncStatus ? ` · ${v.lastSyncStatus}` : ""}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </PageSection>
              )}

              <PageSection
                id="local-suppliers"
                title="Local & specialty suppliers"
                description="Pulled from inventory supplier fields, purchase orders, and credits"
              >
                {supplierVendors.length === 0 ? (
                  <p className="py-8 text-center text-slate-500">
                    No vendors yet — set a supplier on inventory items to group orders here.
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {supplierVendors.map((v) => (
                      <div key={v.name} className="rounded-xl border bg-white p-4">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-900">{v.name}</p>
                          {v.lowStockCount > 0 && (
                            <Badge className="bg-amber-100 text-amber-800">{v.lowStockCount} low</Badge>
                          )}
                        </div>
                        <dl className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <dt className="text-slate-500">Inventory items</dt>
                            <dd className="font-medium">{v.itemCount}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-500">Suggested reorder</dt>
                            <dd className="font-medium text-orange-700">
                              {v.suggestedLineCount} lines · {formatCurrency(v.suggestedTotal)}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-500">Open POs</dt>
                            <dd className="font-medium">
                              {v.openPoCount} · {formatCurrency(v.openPoTotal)}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-500">90-day spend</dt>
                            <dd className="font-medium">{formatCurrency(v.spentLast90Days)}</dd>
                          </div>
                          {v.openCreditCount > 0 && (
                            <div className="flex justify-between">
                              <dt className="text-slate-500">Open credits</dt>
                              <dd className="font-medium text-amber-700">
                                {v.openCreditCount} · {formatCurrency(v.openCreditTotal)}
                              </dd>
                            </div>
                          )}
                        </dl>
                        {v.suggestedLineCount > 0 && (
                          <Button
                            size="sm"
                            className="mt-4 w-full"
                            onClick={() => createPoForVendor(v.name)}
                            disabled={creatingPoVendor === v.name}
                          >
                            {creatingPoVendor === v.name ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Truck className="mr-2 h-4 w-4" />
                            )}
                            Create PO ({v.suggestedLineCount} lines)
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </PageSection>
            </PageSectionShell>
          )}

          {tab === "suggestions" && (
            <PageSectionShell pageId="loading-dock-suggestions">
              <PageSection
                id="auto-order"
                title="Predictive Auto-Ordering"
                description="Based on sales velocity, current stock, and upcoming holidays"
                defaultOpen
                headerActions={
                  <Button onClick={createPoFromSuggestions} disabled={creatingPo || suggestions.length === 0} size="sm">
                    {creatingPo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                    Create PO from suggestions
                  </Button>
                }
              >
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
              </PageSection>
            </PageSectionShell>
          )}

          {tab === "orders" && (
            <PageSectionShell pageId="loading-dock-orders">
              {pendingReceivingPos.length === 0 && receivedPos.length === 0 ? (
                <PageSection id="po-empty" title="POs & receiving">
                  <p className="py-8 text-center text-slate-500">
                    No active purchase orders — approve a Smart PO or create one from Auto-Order.
                  </p>
                </PageSection>
              ) : (
                <>
                  {pendingReceivingPos.length > 0 && (
                    <PageSection
                      id="po-pending"
                      title="Pending"
                      description={`${pendingReceivingPos.length} PO(s) · ${formatCurrency(pendingReceivingPos.reduce((s, p) => s + p.totalAmount, 0))}`}
                      defaultOpen
                    >
                      <div className="space-y-4">
                        {pendingReceivingPos.map((po) => {
                          const paymentStatus = derivePoPaymentStatus(po, openCreditInvoiceIds);
                          const paymentDetail = paymentStatusDetail(po, paymentStatus);
                          return (
                            <PoReceivingCard
                              key={po.id}
                              po={po}
                              paymentStatus={paymentStatus}
                              paymentDetail={paymentDetail}
                              receivingPoId={receivingPoId}
                              onReceive={receivePo}
                              onScanInvoice={openInvoiceScan}
                            />
                          );
                        })}
                      </div>
                    </PageSection>
                  )}

                  {receivedPos.length > 0 && (
                    <PageSection
                      id="po-received"
                      title="Received"
                      description={`${receivedPos.length} PO(s) · ${formatCurrency(receivedPos.reduce((s, p) => s + p.totalAmount, 0))}`}
                    >
                      <div className="space-y-4">
                        {receivedPos.map((po) => {
                          const paymentStatus = derivePoPaymentStatus(po, openCreditInvoiceIds);
                          const paymentDetail = paymentStatusDetail(po, paymentStatus);
                          return (
                            <PoReceivingCard
                              key={po.id}
                              po={po}
                              paymentStatus={paymentStatus}
                              paymentDetail={paymentDetail}
                              receivingPoId={receivingPoId}
                              onReceive={receivePo}
                              onScanInvoice={openInvoiceScan}
                            />
                          );
                        })}
                      </div>
                    </PageSection>
                  )}
                </>
              )}
            </PageSectionShell>
          )}

          {tab === "invoices" && (
            <PageSectionShell pageId="loading-dock-invoices">
              <PageSection id="three-way-match" title="Three-way match" defaultOpen>
                <ThreeWayMatchPanel invoices={invoices} orders={orders} onRefresh={load} />
              </PageSection>
            </PageSectionShell>
          )}

          {tab === "credits" && (
            <PageSectionShell pageId="loading-dock-credits">
              <PageSection id="credit-intro" title="Credit memo tracking" defaultOpen>
                <div className="flex flex-wrap items-start gap-4 rounded-lg border border-violet-100 bg-violet-50/40 p-4">
                  <Camera className="h-10 w-10 shrink-0 text-violet-600" />
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">
                      Dishwasher snaps shattered glass, rotten produce, or short-ships — Pinnacle generates a credit
                      request, emails the vendor rep, and <strong>locks accounting sync</strong> so your bookkeeper
                      cannot pay the full invoice until the credit is officially applied.
                    </p>
                    {openCredits.length > 0 && (
                      <p className="mt-2 text-sm font-medium text-amber-800">
                        {openCredits.length} open credit(s) — {formatCurrency(openCredits.reduce((s, c) => s + c.amount, 0))} owed by vendors
                      </p>
                    )}
                  </div>
                  <Button onClick={() => setCreditMemoOpen(true)}>
                    <Camera className="mr-2 h-4 w-4" />
                    Snap damage & request credit
                  </Button>
                </div>
                {creditSaveNote && (
                  <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                    {creditSaveNote}
                  </p>
                )}
              </PageSection>

              <PageSection id="credit-quick-log" title="Quick log (no photo)">
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
                    Log credit & email rep
                  </Button>
                </div>
              </PageSection>

              <PageSection id="credit-tracker" title="Credit tracker">
                {credits.length === 0 ? (
                  <p className="text-sm text-slate-500">No credits logged.</p>
                ) : (
                  <div className="space-y-3">
                    {credits.map((c) => (
                      <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{c.vendor}</span>
                          <span className="font-semibold text-orange-700">{formatCurrency(c.amount)}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{c.reason}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                          {c.category && <Badge className="bg-slate-100">{c.category.replace(/_/g, " ")}</Badge>}
                          {c.emailStatus && (
                            <span className="flex items-center gap-1">
                              Email: {c.emailStatus}
                              {c.repEmail ? ` → ${c.repEmail}` : ""}
                            </span>
                          )}
                          {c.accountingLocked && (
                            <span className="flex items-center gap-1 text-amber-700">
                              <ShieldCheck className="h-3 w-3" /> AP sync locked
                            </span>
                          )}
                        </div>
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
              </PageSection>
            </PageSectionShell>
          )}
        </>
      )}

      {creditMemoOpen && (
        <CreditMemoModal
          invoices={invoices.map((i) => ({
            id: i.id,
            vendor: i.vendor,
            invoiceNumber: i.invoiceNumber,
            amount: i.amount,
          }))}
          onSaved={(result) => {
            const parts = ["Credit request submitted."];
            if (result.email?.message) parts.push(result.email.message);
            if (result.accountingLocked) parts.push("Accounting sync locked on linked invoice.");
            setCreditSaveNote(parts.join(" "));
            load();
          }}
          onClose={() => setCreditMemoOpen(false)}
        />
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

function PoReceivingCard({
  po,
  paymentStatus,
  paymentDetail,
  receivingPoId,
  onReceive,
  onScanInvoice,
}: {
  po: PurchaseOrder;
  paymentStatus: PoPaymentStatus;
  paymentDetail: string | null;
  receivingPoId: string | null;
  onReceive: (po: PurchaseOrder) => void;
  onScanInvoice: (po: PurchaseOrder) => void;
}) {
  const linkedInvoice = po.invoices?.[0];

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">
            {po.poNumber ?? po.id.slice(-8)} — {po.vendor ?? "Vendor"}
          </p>
          <p className="text-sm text-slate-500">
            {formatCurrency(po.totalAmount)} · {new Date(po.submittedAt).toLocaleDateString()}
            {po.receipts?.length > 0 && ` · ${po.receipts.length} receipt(s)`}
            {linkedInvoice?.invoiceNumber && ` · ${linkedInvoice.invoiceNumber}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={STATUS_COLORS[po.status] ?? "bg-slate-100"}>{po.status.replace(/_/g, " ")}</Badge>
          <Badge className={PO_PAYMENT_COLORS[paymentStatus]}>{PO_PAYMENT_LABELS[paymentStatus]}</Badge>
          {po.matchStatus && po.matchStatus !== "PENDING" && (
            <Badge className={MATCH_COLORS[po.matchStatus] ?? "bg-slate-100"}>{po.matchStatus}</Badge>
          )}
        </div>
      </div>

      {paymentDetail && (
        <p
          className={`mb-3 text-sm ${
            paymentStatus === "ON_HOLD" ? "text-red-700" : paymentStatus === "PAID" ? "text-green-700" : "text-slate-600"
          }`}
        >
          {paymentDetail}
        </p>
      )}

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
          <Button size="sm" variant="secondary" onClick={() => onReceive(po)} disabled={receivingPoId === po.id}>
            {receivingPoId === po.id ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <PackageCheck className="mr-1 h-3 w-3" />
            )}
            Receive delivery
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onScanInvoice(po)}>
          <Camera className="mr-1 h-3 w-3" />
          {po.invoices?.length ? "Scan / link invoice" : "Scan invoice"}
        </Button>
      </div>
    </div>
  );
}
