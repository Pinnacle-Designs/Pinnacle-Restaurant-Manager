"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Camera,
  Loader2,
  ShieldAlert,
  RefreshCw,
  FileScan,
  Link2,
} from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { Select, FormField } from "@/components/ui/form";
import { formatCurrency, formatDate } from "@/lib/utils";
import { clientFetch } from "@/lib/embed-api-client";
import { parseJsonResponse } from "@/lib/fetch-json";
import { filterBySearchQuery } from "@/lib/search/text-match";
import { usePageSearch } from "@/hooks/usePageSearch";
import { ScannedImageViewer } from "@/components/scan/ScannedImageViewer";
import { InvoiceScanModal, type InvoiceSaveResult } from "./InvoiceScanModal";

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

interface LinkablePo {
  id: string;
  poNumber: string | null;
  vendor: string | null;
  totalAmount: number;
  status: string;
  receipts: { id: string }[];
  invoices?: { id: string }[];
}

interface InvoiceLine {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  sku?: string | null;
}

interface MatchLine {
  description: string;
  poQty: number | null;
  receivedQty: number | null;
  invoiceQty: number | null;
  unit: string;
  status: string;
}

interface MatchDetail {
  invoice: {
    id: string;
    vendor: string;
    invoiceNumber: string | null;
    amount: number;
    invoiceDate: string;
    poId: string | null;
    receiptId: string | null;
    imageUrl: string | null;
    lines: InvoiceLine[];
  };
  po: {
    id: string;
    poNumber: string | null;
    totalAmount: number;
    lines: Array<{
      description: string;
      qtyOrdered: number;
      qtyReceived: number;
      unit: string;
      unitPrice: number;
    }>;
  } | null;
  receipt: {
    id: string;
    vendor: string;
    lines: Array<{
      description: string;
      qtyReceived: number;
      unit: string;
      unitCost: number;
    }>;
  } | null;
  match: {
    status: string;
    payRecommendation: string;
    exposureTotal: number;
    summary: string;
    lines: MatchLine[];
    discrepancies: Array<{ type: string; description: string; severity: string; exposureAmount?: number }>;
  };
}

const MATCH_COLORS: Record<string, string> = {
  MATCHED: "bg-green-100 text-green-800",
  DISCREPANCY: "bg-red-100 text-red-800",
  PENDING: "bg-amber-100 text-amber-800",
};

function invoiceSearchFields(inv: VendorInvoice): string[] {
  const iso = inv.invoiceDate.split("T")[0] ?? inv.invoiceDate;
  const parsed = new Date(inv.invoiceDate);
  const localized = Number.isNaN(parsed.getTime()) ? iso : formatDate(parsed);
  return [
    inv.vendor,
    inv.invoiceNumber ?? "",
    iso,
    localized,
    String(parsed.getFullYear()),
    formatCurrency(inv.amount),
    inv.matchStatus,
  ];
}

export function ThreeWayMatchPanel({
  invoices,
  orders,
  onRefresh,
}: {
  invoices: VendorInvoice[];
  orders: LinkablePo[];
  onRefresh: () => void;
}) {
  const { query, hasQuery } = usePageSearch();
  const visibleInvoices = filterBySearchQuery(invoices, query, invoiceSearchFields);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanContext, setScanContext] = useState<{ poId?: string; receiptId?: string }>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);
  const [linkPoId, setLinkPoId] = useState("");
  const [linking, setLinking] = useState(false);

  const discrepancyCount = invoices.filter((i) => i.matchStatus === "DISCREPANCY").length;

  const linkablePos = orders.filter(
    (po) => po.receipts.length > 0 || po.status === "RECEIVED" || po.status === "PARTIAL"
  );

  const openScan = useCallback(() => {
    const candidate = linkablePos.find((po) => po.receipts.length > 0 && !(po.invoices?.length ?? 0));
    setScanContext({
      poId: candidate?.id,
      receiptId: candidate?.receipts[0]?.id,
    });
    setScanOpen(true);
  }, [linkablePos]);

  const loadDetail = useCallback(async (invoiceId: string) => {
    setSelectedId(invoiceId);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(true);
    try {
      const res = await clientFetch(`/api/purchasing/match?invoiceId=${invoiceId}`);
      const data = await parseJsonResponse<MatchDetail & { error?: string }>(res);
      if (!res.ok) {
        setDetailError(data.error || "Could not load match details");
        return;
      }
      setDetail(data);
      setLinkPoId(data.invoice.poId ?? "");
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Could not load match details");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (invoices.length === 1 && !selectedId) {
      void loadDetail(invoices[0]!.id);
    }
  }, [invoices, selectedId, loadDetail]);

  const rematch = async (invoiceId: string) => {
    setRematching(true);
    try {
      await clientFetch("/api/purchasing/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      await loadDetail(invoiceId);
      onRefresh();
    } finally {
      setRematching(false);
    }
  };

  const linkPo = async () => {
    if (!selectedId || !linkPoId) return;
    setLinking(true);
    setDetailError(null);
    try {
      const po = orders.find((p) => p.id === linkPoId);
      const res = await clientFetch("/api/purchasing/invoices/scan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: selectedId,
          poId: linkPoId,
          receiptId: po?.receipts[0]?.id ?? null,
        }),
      });
      const data = await parseJsonResponse<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Could not link PO");
      await loadDetail(selectedId);
      onRefresh();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Could not link PO");
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card border-blue-100 bg-blue-50/40">
        <div className="flex flex-wrap items-start gap-4">
          <FileScan className="h-10 w-10 shrink-0 text-blue-600" />
          <div className="flex-1">
            <h2 className="font-semibold text-slate-900">Invoice digitization &amp; price auditing</h2>
            <p className="mt-1 text-sm text-slate-600">
              Photograph messy paper invoices — OCR extracts every line, updates inventory, logs expenses, and
              compares vendor prices to history. Catch-weight items are audited so you are not paying for heavy
              boxes.
            </p>
          </div>
          <Button onClick={openScan}>
            <Camera className="mr-2 h-4 w-4" />
            Scan invoice
          </Button>
        </div>
        {saveSummary && (
          <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {saveSummary}
          </p>
        )}
      </div>

      <div className="card border-orange-100 bg-orange-50/40">
        <div className="flex flex-wrap items-start gap-4">
          <ShieldAlert className="h-10 w-10 shrink-0 text-orange-600" />
          <div className="flex-1">
            <h2 className="font-semibold text-slate-900">Three-way match (invoice protection)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Compares <strong>what you ordered (PO)</strong>, <strong>what came off the truck (receiving)</strong>,
              and <strong>what the vendor bills (invoice)</strong>. Short-ships and overcharges are flagged before
              you pay.
            </p>
            {discrepancyCount > 0 && (
              <p className="mt-2 text-sm font-medium text-red-700">
                {discrepancyCount} invoice(s) on hold — do not pay until resolved.
              </p>
            )}
          </div>
          <Button onClick={openScan}>
            <Camera className="mr-2 h-4 w-4" />
            Scan invoice
          </Button>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="card py-8 text-center text-slate-500">
          Receive a PO, then scan the vendor invoice to run automatic three-way matching.
        </div>
      ) : visibleInvoices.length === 0 ? (
        <div className="card py-8 text-center text-slate-500">
          No invoices match &ldquo;{query.trim()}&rdquo;. Try a vendor name, invoice #, or date.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {hasQuery && (
              <p className="text-xs text-slate-500">
                Showing {visibleInvoices.length} of {invoices.length} invoice(s)
              </p>
            )}
            {visibleInvoices.map((inv) => {
              let exposure = 0;
              try {
                if (inv.matchNotes) {
                  const notes = JSON.parse(inv.matchNotes) as Array<{ exposureAmount?: number }>;
                  exposure = notes.reduce((s, n) => s + (n.exposureAmount ?? 0), 0);
                }
              } catch {
                /* ignore */
              }
              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => loadDetail(inv.id)}
                  className={`card w-full text-left transition-shadow hover:shadow-md ${
                    selectedId === inv.id ? "ring-2 ring-orange-400" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{inv.vendor}</p>
                      <p className="text-sm text-slate-500">
                        {inv.invoiceNumber ?? "No #"} · {formatDate(inv.invoiceDate)} ·{" "}
                        {formatCurrency(inv.amount)}
                        {inv.poId ? "" : " · No PO linked"}
                      </p>
                    </div>
                    <Badge className={MATCH_COLORS[inv.matchStatus] ?? "bg-slate-100"}>
                      {inv.matchStatus === "MATCHED" && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                      {inv.matchStatus === "DISCREPANCY" && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                      {inv.matchStatus}
                    </Badge>
                  </div>
                  {inv.matchStatus === "DISCREPANCY" && exposure > 0 && (
                    <p className="mt-2 text-sm text-red-700">{formatCurrency(exposure)} at risk if paid</p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="card min-h-[16rem]">
            {!selectedId ? (
              <p className="py-12 text-center text-sm text-slate-500">
                Select an invoice to see PO · Receipt · Invoice comparison
              </p>
            ) : loadingDetail ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              </div>
            ) : detailError ? (
              <div className="py-8 text-center">
                <p className="text-sm text-red-600">{detailError}</p>
                <Button size="sm" variant="ghost" className="mt-3" onClick={() => loadDetail(selectedId)}>
                  Retry
                </Button>
              </div>
            ) : detail ? (
              <div className="space-y-4">
                <ScannedImageViewer src={detail.invoice.imageUrl} alt="Vendor invoice scan" />

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium uppercase text-slate-500">Invoice (OCR)</p>
                    <p className="mt-1 font-semibold text-slate-900">{detail.invoice.vendor}</p>
                    <p className="text-sm text-slate-600">
                      #{detail.invoice.invoiceNumber ?? "—"} · {formatCurrency(detail.invoice.amount)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(detail.invoice.invoiceDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                    <p className="text-xs font-medium uppercase text-blue-700">Purchase order</p>
                    {detail.po ? (
                      <>
                        <p className="mt-1 font-semibold text-slate-900">
                          PO {detail.po.poNumber ?? detail.po.id.slice(0, 8)}
                        </p>
                        <p className="text-sm text-slate-600">{formatCurrency(detail.po.totalAmount)}</p>
                        <p className="text-xs text-slate-500">{detail.po.lines.length} line(s)</p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-amber-800">No PO linked</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50/50 p-3">
                    <p className="text-xs font-medium uppercase text-green-700">Receiving log</p>
                    {detail.receipt ? (
                      <>
                        <p className="mt-1 font-semibold text-slate-900">{detail.receipt.vendor}</p>
                        <p className="text-xs text-slate-500">{detail.receipt.lines.length} line(s) received</p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-amber-800">No receipt linked</p>
                    )}
                  </div>
                </div>

                {!detail.po && linkablePos.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-2 text-sm font-medium text-amber-900">
                      Link a PO to run three-way match
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <FormField label="Purchase order" className="min-w-[12rem] flex-1">
                        <Select
                          value={linkPoId}
                          onChange={(e) => setLinkPoId(e.target.value)}
                        >
                          <option value="">Select PO…</option>
                          {linkablePos.map((po) => (
                            <option key={po.id} value={po.id}>
                              {po.poNumber ?? po.id.slice(0, 8)} · {po.vendor ?? "Vendor"} ·{" "}
                              {formatCurrency(po.totalAmount)}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      <Button size="sm" onClick={linkPo} disabled={!linkPoId || linking}>
                        {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
                        Link PO
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge
                    className={
                      detail.match.payRecommendation === "APPROVE"
                        ? "bg-green-100 text-green-800"
                        : detail.match.payRecommendation === "HOLD"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800"
                    }
                  >
                    {detail.match.payRecommendation === "HOLD"
                      ? "Hold payment"
                      : detail.match.payRecommendation === "APPROVE"
                        ? "Safe to pay"
                        : "Incomplete"}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => rematch(selectedId)} disabled={rematching}>
                    <RefreshCw className={`mr-1 h-3 w-3 ${rematching ? "animate-spin" : ""}`} />
                    Re-run match
                  </Button>
                </div>
                <p className="text-sm text-slate-600">{detail.match.summary}</p>

                {detail.match.discrepancies.length > 0 && (
                  <ul className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {detail.match.discrepancies.map((d, i) => (
                      <li key={i}>
                        <span className="font-medium uppercase text-red-600">{d.type.replace(/_/g, " ")}:</span>{" "}
                        {d.description}
                      </li>
                    ))}
                  </ul>
                )}

                {detail.invoice.lines.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-slate-500">Invoice line items (extracted)</p>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-slate-50 text-left text-slate-500">
                            <th className="p-2">SKU</th>
                            <th className="p-2">Item</th>
                            <th className="p-2">Qty</th>
                            <th className="p-2">Unit $</th>
                            <th className="p-2">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.invoice.lines.map((line, i) => (
                            <tr key={i} className="border-b border-slate-100">
                              <td className="p-2 font-mono text-[11px] uppercase text-slate-500">
                                {line.sku ?? "—"}
                              </td>
                              <td className="p-2 font-medium">{line.description || "—"}</td>
                              <td className="p-2">
                                {line.qty} {line.unit}
                              </td>
                              <td className="p-2">{formatCurrency(line.unitPrice)}</td>
                              <td className="p-2">{formatCurrency(line.lineTotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-slate-500">PO · Received · Invoiced</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-slate-500">
                          <th className="pb-2 pr-2">Item</th>
                          <th className="pb-2 pr-2">PO ordered</th>
                          <th className="pb-2 pr-2">Received</th>
                          <th className="pb-2">Invoiced</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.match.lines.length > 0
                          ? detail.match.lines
                          : detail.invoice.lines.map((l) => ({
                              description: l.description,
                              poQty: null,
                              receivedQty: null,
                              invoiceQty: l.qty,
                              unit: l.unit,
                              status: "PENDING",
                            }))
                        ).map((line, i) => (
                          <tr
                            key={i}
                            className={`border-b border-slate-100 ${line.status === "DISCREPANCY" ? "bg-red-50" : ""}`}
                          >
                            <td className="py-2 pr-2 font-medium">{line.description}</td>
                            <td className="py-2 pr-2">
                              {line.poQty != null ? `${line.poQty} ${line.unit}` : "—"}
                            </td>
                            <td className="py-2 pr-2">
                              {line.receivedQty != null ? `${line.receivedQty} ${line.unit}` : "—"}
                            </td>
                            <td className="py-2">
                              {line.invoiceQty != null ? `${line.invoiceQty} ${line.unit}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-slate-500">
                Select an invoice to load match details.
              </p>
            )}
          </div>
        </div>
      )}

      {scanOpen && (
        <InvoiceScanModal
          poId={scanContext.poId}
          receiptId={scanContext.receiptId}
          onSaved={(result: InvoiceSaveResult) => {
            const parts: string[] = ["Invoice saved."];
            if (result.priceAlerts?.length) {
              parts.push(
                `${result.priceAlerts.length} price spike(s) — recipes updated (${result.recipesUpdated ?? 0} items).`
              );
            }
            if (result.catchWeightAlerts?.length) {
              parts.push(`${result.catchWeightAlerts.length} catch-weight alert(s).`);
            }
            if (result.inventoryUpdated) parts.push(`${result.inventoryUpdated} inventory item(s) updated.`);
            if (result.expenseId) parts.push("Expense logged.");
            setSaveSummary(parts.join(" "));
            onRefresh();
            setScanOpen(false);
            const savedId = (result.invoice as { id?: string } | undefined)?.id;
            if (savedId) void loadDetail(savedId);
          }}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}
