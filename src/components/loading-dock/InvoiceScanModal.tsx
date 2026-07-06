"use client";

import { useState } from "react";
import { Loader2, CheckCircle, Scale, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils";
import { submitScanForm } from "@/lib/scan/submit-scan";
import type { OcrSource } from "@/lib/ocr/capabilities";
import { showCriticalNotifications } from "@/lib/notifications";
import { DocumentQuickScanCapture } from "@/components/scan/DocumentQuickScanCapture";
import { ScanOcrNotice } from "@/components/scan/ScanOcrNotice";
import { useDocumentQuickScan } from "@/hooks/useDocumentQuickScan";

function normalizeInvoiceData(raw: Partial<InvoiceData> | null | undefined): InvoiceData {
  const today = new Date().toISOString().split("T")[0]!;
  const lines = Array.isArray(raw?.lines)
    ? raw.lines.map((line, i) => ({
        description: String(line?.description ?? `Line item ${i + 1}`),
        qty: Number(line?.qty) || 0,
        unit: String(line?.unit ?? "each"),
        unitPrice: Number(line?.unitPrice) || 0,
        lineTotal: Number(line?.lineTotal) || 0,
        sku: line?.sku,
        inventoryItemId: line?.inventoryItemId,
        catchWeightBilled: line?.catchWeightBilled,
        catchWeightUnit: line?.catchWeightUnit,
      }))
    : [];
  const amount = Number(raw?.amount) || lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return {
    vendor: String(raw?.vendor ?? ""),
    invoiceNumber: String(raw?.invoiceNumber ?? ""),
    amount,
    invoiceDate: String(raw?.invoiceDate ?? today),
    lines,
  };
}

function emptyLine(): InvoiceLineData {
  return { description: "", qty: 1, unit: "case", unitPrice: 0, lineTotal: 0 };
}

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
  const [ocrSource, setOcrSource] = useState<OcrSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scanInvoice = async () => {
    setScanning(true);
    setError(null);
    try {
      const data = await submitScanForm<{
        invoice: InvoiceData;
        pageCount?: number;
        panoramic?: boolean;
        ocrSource?: OcrSource;
      }>("/api/purchasing/invoices/scan", scan.buildScanFormData());
      setInvoiceData(normalizeInvoiceData(data.invoice));
      setOcrSource(data.ocrSource ?? null);
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
    const lines = invoiceData.lines.map((l, i) => {
      if (i !== index) return l;
      const next = { ...l, ...patch };
      if ("qty" in patch || "unitPrice" in patch) {
        next.lineTotal = (Number(next.qty) || 0) * (Number(next.unitPrice) || 0);
      }
      return next;
    });
    const amount = lines.reduce((sum, l) => sum + (Number(l.lineTotal) || 0), 0);
    setInvoiceData({ ...invoiceData, lines, amount });
  };

  const addLine = () => {
    if (!invoiceData) return;
    setInvoiceData({ ...invoiceData, lines: [...invoiceData.lines, emptyLine()] });
  };

  const removeLine = (index: number) => {
    if (!invoiceData) return;
    const lines = invoiceData.lines.filter((_, i) => i !== index);
    const amount = lines.reduce((sum, l) => sum + (Number(l.lineTotal) || 0), 0);
    setInvoiceData({ ...invoiceData, lines, amount });
  };

  const saveInvoice = async () => {
    if (!invoiceData) return;
    if (!invoiceData.vendor.trim()) {
      setError("Enter a vendor name before saving.");
      return;
    }
    if (invoiceData.lines.length === 0) {
      setError("Add at least one line item.");
      return;
    }
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

      const data = await submitScanForm<InvoiceSaveResult>(
        "/api/purchasing/invoices/scan",
        formData,
        "PUT"
      );

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
                scanning
                  ? "Reading text from photo…"
                  : scan.scanMode === "multi"
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
            <ScanOcrNotice source={ocrSource} />
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
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase text-slate-500">Line items</p>
                <Button type="button" variant="ghost" size="sm" onClick={addLine}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add line
                </Button>
              </div>
              {invoiceData.lines.length === 0 && (
                <p className="py-2 text-sm text-slate-500">
                  No line items yet. Tap Add line to enter each product from the invoice.
                </p>
              )}
              {invoiceData.lines.map((line, i) => (
                <div key={i} className="border-b border-slate-100 py-2 text-sm last:border-0">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        value={line.description}
                        placeholder="Description"
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={line.qty}
                          placeholder="Qty"
                          onChange={(e) =>
                            updateLine(i, { qty: parseFloat(e.target.value) || 0 })
                          }
                        />
                        <Input
                          value={line.unit}
                          placeholder="Unit"
                          onChange={(e) => updateLine(i, { unit: e.target.value })}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          value={line.unitPrice}
                          placeholder="Unit $"
                          onChange={(e) =>
                            updateLine(i, { unitPrice: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </div>
                      <p className="text-slate-500">
                        Line total: {formatCurrency(line.lineTotal || 0)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {(line.catchWeightBilled != null ||
                    /case|brisket|fish|lb/i.test(line.description ?? "")) && (
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
