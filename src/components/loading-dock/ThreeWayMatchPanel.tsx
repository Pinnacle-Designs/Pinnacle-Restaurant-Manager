"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Camera, Loader2, ShieldAlert, RefreshCw, FileScan } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
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

export function ThreeWayMatchPanel({
  invoices,
  onRefresh,
}: {
  invoices: VendorInvoice[];
  onRefresh: () => void;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const [scanContext, setScanContext] = useState<{ poId?: string; receiptId?: string }>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saveSummary, setSaveSummary] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);

  const discrepancyCount = invoices.filter((i) => i.matchStatus === "DISCREPANCY").length;

  const loadDetail = async (invoiceId: string) => {
    setSelectedId(invoiceId);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/purchasing/match?invoiceId=${invoiceId}`);
      const data = await res.json();
      if (res.ok) setDetail(data);
    } finally {
      setLoadingDetail(false);
    }
  };

  const rematch = async (invoiceId: string) => {
    setRematching(true);
    try {
      await fetch("/api/purchasing/match", {
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

  return (
    <div className="space-y-4">
      <div className="card border-blue-100 bg-blue-50/40">
        <div className="flex flex-wrap items-start gap-4">
          <FileScan className="h-10 w-10 shrink-0 text-blue-600" />
          <div className="flex-1">
            <h2 className="font-semibold text-slate-900">Invoice digitization &amp; price auditing</h2>
            <p className="mt-1 text-sm text-slate-600">
              Photograph messy paper invoices — OCR extracts every line, updates inventory, logs expenses, and
              compares vendor prices to history. Sneaky price spikes trigger push alerts and recipe cost recalculation.
              Catch-weight items (brisket, fish by the case) are audited: billed lbs vs received lbs so you are not
              paying for heavy boxes.
            </p>
          </div>
          <Button onClick={() => setScanOpen(true)}>
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
              When the delivery truck arrives, Pinnacle compares <strong>what you ordered (PO)</strong>,{" "}
              <strong>what came off the truck (receiving log)</strong>, and{" "}
              <strong>what the vendor bills (invoice)</strong>. Short-ships and overcharges are flagged before you pay.
            </p>
            {discrepancyCount > 0 && (
              <p className="mt-2 text-sm font-medium text-red-700">
                {discrepancyCount} invoice(s) on hold — do not pay until resolved.
              </p>
            )}
          </div>
          <Button onClick={() => setScanOpen(true)}>
            <Camera className="mr-2 h-4 w-4" />
            Scan invoice
          </Button>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="card py-8 text-center text-slate-500">
          Receive a PO, then scan the vendor invoice to run automatic three-way matching.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {invoices.map((inv) => {
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
                        {inv.invoiceNumber ?? "No #"} · {formatCurrency(inv.amount)}
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
              <p className="py-12 text-center text-sm text-slate-500">Select an invoice to see PO · Receipt · Invoice comparison</p>
            ) : loadingDetail ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              </div>
            ) : detail ? (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
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
                <p className="mb-4 text-sm text-slate-600">{detail.match.summary}</p>

                {detail.match.discrepancies.length > 0 && (
                  <ul className="mb-4 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {detail.match.discrepancies.map((d, i) => (
                      <li key={i}>
                        <span className="font-medium uppercase text-red-600">{d.type.replace(/_/g, " ")}:</span>{" "}
                        {d.description}
                      </li>
                    ))}
                  </ul>
                )}

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
                      {detail.match.lines.map((line, i) => (
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
            ) : null}
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
          }}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}
