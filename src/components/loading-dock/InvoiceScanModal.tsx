"use client";

import { useState } from "react";
import { Loader2, CheckCircle, Scale } from "lucide-react";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils";
import { showCriticalNotifications } from "@/lib/notifications";
import { DocumentQuickScanCapture } from "@/components/scan/DocumentQuickScanCapture";
import { useDocumentQuickScan } from "@/hooks/useDocumentQuickScan";

export interface InvoiceLineData {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  sku?: string;
  inventoryItemId?: string;
  catchWeightBilled?: number;
  catchWeightUnit?: string;
}

export interface InvoiceData {
  vendor: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  lines: InvoiceLineData[];
}

export interface InvoiceSaveResult {
  invoice: unknown;
  match: unknown;
  priceAlerts: Array<{ item: string; changePct: number; oldPrice: number; newPrice: number }>;
  catchWeightAlerts?: Array<{ itemName: string; description: string; severity: string }>;
  expenseId?: string;
  inventoryUpdated?: number;
  recipesUpdated?: number;
  pushNotifications?: Array<{ title: string; description: string; severity: string }>;
}

interface InvoiceScanModalProps {
  poId?: string;
  receiptId?: string;
  onSaved: (result: InvoiceSaveResult) => void;
  onClose: () => void;
}

export function InvoiceScanModal({ poId, receiptId, onSaved, onClose }: InvoiceScanModalProps) {
  const scan = useDocumentQuickScan();
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [pageCountScanned, setPageCountScanned] = useState(1);
  const [wasPanoramic, setWasPanoramic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanInvoice = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/purchasing/invoices/scan", {
        method: "POST",
        body: scan.buildScanFormData(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setInvoiceData(data.invoice);
      setPageCountScanned(data.pageCount ?? scan.getPageCount());
      setWasPanoramic(Boolean(data.panoramic));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const updateLine = (index: number, patch: Partial<InvoiceLineData>) => {
    if (!invoiceData) return;
    const lines = invoiceData.lines.map((l, i) => (i === index ? { ...l, ...patch } : l));
    setInvoiceData({ ...invoiceData, lines });
  };

  const saveInvoice = async () => {
    if (!invoiceData) return;
    setSaving(true);
    setError(null);
    try {
      const saveFile = scan.getSaveFile();
      const formData = scan.buildScanFormData({
        vendor: invoiceData.vendor,
        amount: String(invoiceData.amount),
        invoiceDate: invoiceData.invoiceDate,
        invoiceNumber: invoiceData.invoiceNumber,
        lines: JSON.stringify(invoiceData.lines),
        ...(poId ? { poId } : {}),
        ...(receiptId ? { receiptId } : {}),
      });
      if (saveFile && !formData.has("file")) formData.append("file", saveFile);

      const res = await fetch("/api/purchasing/invoices/scan", { method: "PUT", body: formData });
      const data = (await res.json()) as InvoiceSaveResult;
      if (!res.ok) throw new Error((data as { error?: string }).error || "Save failed");

      if (data.pushNotifications?.length) {
        await showCriticalNotifications(data.pushNotifications);
      }

      onSaved(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Scan Vendor Invoice</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {!invoiceData && (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Snap a photo of a crumpled invoice — OCR reads every line item, updates inventory,
              logs the expense, flags price spikes, and audits catch-weight. Use multi-page or
              panoramic mode for long invoices.
            </p>
            <DocumentQuickScanCapture
              scan={scan}
              documentLabel="invoice"
              accent="orange"
              disabled={scanning || saving}
              showExtract
              extracting={scanning}
              onExtract={scanInvoice}
              extractLabel={
                scan.scanMode === "multi"
                  ? `Extract from ${scan.pages.length} page${scan.pages.length === 1 ? "" : "s"} (panoramic stitch)`
                  : scan.scanMode === "panorama"
                    ? "Extract panoramic invoice"
                    : "Extract line items"
              }
              onCancel={scan.hasCapture ? scan.clear : undefined}
            />
          </>
        )}

        {invoiceData && (
          <div className="space-y-3">
            {wasPanoramic && pageCountScanned <= 1 && (
              <p className="text-xs font-medium text-orange-700">Panoramic scan</p>
            )}
            {pageCountScanned > 1 && (
              <p className="text-xs font-medium text-orange-700">
                Combined from {pageCountScanned} scanned pages · panoramic stitch
              </p>
            )}
            <FormField label="Vendor">
              <Input
                value={invoiceData.vendor}
                onChange={(e) => setInvoiceData({ ...invoiceData, vendor: e.target.value })}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Invoice #">
                <Input
                  value={invoiceData.invoiceNumber}
                  onChange={(e) => setInvoiceData({ ...invoiceData, invoiceNumber: e.target.value })}
                />
              </FormField>
              <FormField label="Total">
                <Input
                  type="number"
                  step="0.01"
                  value={invoiceData.amount}
                  onChange={(e) =>
                    setInvoiceData({ ...invoiceData, amount: parseFloat(e.target.value) || 0 })
                  }
                />
              </FormField>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-medium uppercase text-slate-500">Line items</p>
              {invoiceData.lines.map((line, i) => (
                <div key={i} className="border-b border-slate-100 py-2 text-sm last:border-0">
                  <p className="font-medium">{line.description}</p>
                  <p className="text-slate-500">
                    {line.qty} {line.unit} × {formatCurrency(line.unitPrice)} ={" "}
                    {formatCurrency(line.lineTotal)}
                  </p>
                  {(line.catchWeightBilled != null || /case|brisket|fish|lb/i.test(line.description)) && (
                    <div className="mt-2 flex items-center gap-2">
                      <Scale className="h-3.5 w-3.5 text-orange-500" />
                      <label className="text-xs text-slate-600">
                        Catch weight billed:
                        <Input
                          type="number"
                          step="0.1"
                          className="ml-2 inline-block w-20 py-1 text-xs"
                          value={line.catchWeightBilled ?? ""}
                          onChange={(e) =>
                            updateLine(i, {
                              catchWeightBilled: e.target.value
                                ? parseFloat(e.target.value)
                                : undefined,
                              catchWeightUnit: line.catchWeightUnit ?? "lbs",
                            })
                          }
                          placeholder="lbs"
                        />
                        <span className="ml-1">{line.catchWeightUnit ?? "lbs"}</span>
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Button onClick={saveInvoice} disabled={saving} className="w-full">
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Save · update inventory · audit prices
            </Button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
