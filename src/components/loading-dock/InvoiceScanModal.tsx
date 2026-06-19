"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Camera, Upload, Loader2, FileText, CheckCircle, Scale } from "lucide-react";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils";
import { showCriticalNotifications } from "@/lib/notifications";
import { readFileAsDataUrl } from "@/lib/receipt/panorama-stitch";
import {
  DocumentScanModeToggle,
  type DocumentScanMode,
} from "@/components/scan/DocumentScanModeToggle";
import {
  MultiPageScanCapture,
  type ScanPage,
  type StitchedDocument,
} from "@/components/scan/MultiPageScanCapture";
import { PanoramicScanCapture } from "@/components/scan/PanoramicScanCapture";

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

type ScanMode = DocumentScanMode;

export function InvoiceScanModal({ poId, receiptId, onSaved, onClose }: InvoiceScanModalProps) {
  const [scanMode, setScanMode] = useState<ScanMode>("single");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [stitched, setStitched] = useState<StitchedDocument | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [pageCountScanned, setPageCountScanned] = useState(1);
  const [wasPanoramic, setWasPanoramic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const canExtractMulti =
    pages.length > 0 && (sessionComplete || pages.length > 1);

  const clear = () => {
    setPreview(null);
    setFile(null);
    setPages([]);
    setStitched(null);
    setSessionComplete(false);
    setInvoiceData(null);
    setPageCountScanned(1);
    setWasPanoramic(false);
    setError(null);
  };

  const switchMode = (mode: ScanMode) => {
    if (mode === scanMode) return;
    clear();
    setScanMode(mode);
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setInvoiceData(null);
    setError(null);
    setPreview(await readFileAsDataUrl(selectedFile));
  };

  const scanInvoice = async () => {
    setScanning(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("scanMode", scanMode);
      if (scanMode === "panorama") formData.append("panoramic", "true");
      if (scanMode === "single" || scanMode === "panorama") {
        if (!file) return;
        formData.append("file", file);
      } else {
        for (const page of pages) {
          formData.append("files", page.file);
        }
      }
      const res = await fetch("/api/purchasing/invoices/scan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setInvoiceData(data.invoice);
      setPageCountScanned(data.pageCount ?? pages.length);
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
      const formData = new FormData();
      formData.append("scanMode", scanMode);
      if (scanMode === "panorama" || wasPanoramic) formData.append("panoramic", "true");
      const saveFile =
        scanMode === "multi" ? stitched?.file ?? pages[0]?.file ?? null : file;
      if (saveFile) formData.append("file", saveFile);
      formData.append("vendor", invoiceData.vendor);
      formData.append("amount", String(invoiceData.amount));
      formData.append("invoiceDate", invoiceData.invoiceDate);
      formData.append("invoiceNumber", invoiceData.invoiceNumber);
      if (poId) formData.append("poId", poId);
      if (receiptId) formData.append("receiptId", receiptId);
      formData.append("lines", JSON.stringify(invoiceData.lines));
      formData.append("pageCount", String(scanMode === "multi" ? pages.length : 1));

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

  const showSingleCapture = scanMode === "single" && !preview && !invoiceData;
  const showSinglePreview = scanMode === "single" && preview && !invoiceData;
  const showPanoramaCapture = scanMode === "panorama" && !invoiceData;
  const showMultiCapture = scanMode === "multi" && !invoiceData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Scan Vendor Invoice</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <DocumentScanModeToggle mode={scanMode} onChange={switchMode} accent="orange" className="mb-4" />

        {showSingleCapture && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              Snap a photo of a crumpled invoice — OCR reads every line item, updates inventory,
              logs the expense, flags price spikes, and audits catch-weight.
            </p>
            <Button onClick={() => cameraInputRef.current?.click()}>
              <Camera className="mr-2 h-4 w-4" /> Take Photo
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Upload Image
            </Button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void handleFileSelect(e.target.files[0])}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void handleFileSelect(e.target.files[0])}
            />
          </div>
        )}

        {showSinglePreview && (
          <div className="space-y-4">
            <div className="relative h-40 w-full overflow-hidden rounded-lg bg-slate-100">
              <Image src={preview} alt="Invoice preview" fill className="object-contain" unoptimized />
            </div>
            <Button onClick={scanInvoice} disabled={scanning} className="w-full">
              {scanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              {scanning ? "Reading invoice…" : "Extract line items"}
            </Button>
          </div>
        )}

        {showPanoramaCapture && (
          <div className="space-y-4">
            <PanoramicScanCapture
              documentLabel="invoice"
              accentClass="orange"
              preview={preview}
              onSelectFile={(f) => void handleFileSelect(f)}
              onClear={clear}
              disabled={scanning || saving}
            />
            {preview && (
              <Button onClick={scanInvoice} disabled={scanning} className="w-full">
                {scanning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                {scanning ? "Reading panoramic invoice…" : "Extract panoramic invoice"}
              </Button>
            )}
          </div>
        )}

        {showMultiCapture && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Long invoices and packing reports — scan each page top to bottom, then extract all
              line items together.
            </p>
            <MultiPageScanCapture
              documentLabel="invoice"
              accentClass="orange"
              pages={pages}
              onPagesChange={(next) => {
                setPages(next);
                setInvoiceData(null);
              }}
              onStitchedChange={setStitched}
              sessionComplete={sessionComplete}
              onSessionCompleteChange={setSessionComplete}
              disabled={scanning || saving}
            />
            {pages.length > 0 && (
              <>
                <Button
                  onClick={scanInvoice}
                  disabled={scanning || !canExtractMulti}
                  className="w-full"
                >
                  {scanning ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  {scanning
                    ? `Reading ${pages.length} pages…`
                    : `Extract from ${pages.length} page${pages.length === 1 ? "" : "s"} (panoramic stitch)`}
                </Button>
                {!canExtractMulti && pages.length === 1 && !sessionComplete && (
                  <p className="text-center text-xs text-slate-500">
                    Scan more pages or tap &quot;Done scanning&quot; to extract.
                  </p>
                )}
              </>
            )}
          </div>
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
