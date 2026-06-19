"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Camera, Upload, Loader2, Receipt, CheckCircle } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { Input, Select, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils";
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

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  receiptUrl: string | null;
}

interface ReceiptData {
  description: string;
  amount: number;
  category: string;
  date: string;
  vendor: string;
  items: string[];
}

interface ReceiptScannerProps {
  onExpenseCreated: (expense: Expense) => void;
}

const EXPENSE_CATEGORIES = [
  "Food & Supplies",
  "Utilities",
  "Maintenance",
  "Labor",
  "Marketing",
  "Equipment",
  "Insurance",
  "Other",
];

export function ReceiptScanner({ onExpenseCreated }: ReceiptScannerProps) {
  const [scanMode, setScanMode] = useState<DocumentScanMode>("single");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [stitched, setStitched] = useState<StitchedDocument | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [pageCountScanned, setPageCountScanned] = useState(1);
  const [wasPanoramic, setWasPanoramic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const hasCapture =
    scanMode === "multi" ? pages.length > 0 : !!preview;
  const canExtractMulti =
    scanMode === "multi" && pages.length > 0 && (sessionComplete || pages.length > 1);

  const clear = () => {
    setPreview(null);
    setFile(null);
    setPages([]);
    setStitched(null);
    setSessionComplete(false);
    setReceiptData(null);
    setPageCountScanned(1);
    setWasPanoramic(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const switchMode = (mode: DocumentScanMode) => {
    if (mode === scanMode) return;
    clear();
    setScanMode(mode);
  };

  const handleSingleFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setReceiptData(null);
    setError(null);
    setPreview(await readFileAsDataUrl(selectedFile));
  };

  const scanReceipt = async () => {
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
        if (pages.length === 0) return;
        for (const page of pages) {
          formData.append("files", page.file);
        }
      }

      const res = await fetch("/api/receipts/scan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");

      setReceiptData(data.receipt);
      setPageCountScanned(data.pageCount ?? (scanMode === "multi" ? pages.length : 1));
      setWasPanoramic(Boolean(data.panoramic));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const saveExpense = async () => {
    if (!receiptData) return;
    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("scanMode", scanMode);
      if (scanMode === "panorama" || wasPanoramic) formData.append("panoramic", "true");

      const saveFile =
        scanMode === "multi"
          ? stitched?.file ?? pages[0]?.file ?? null
          : file;
      if (saveFile) formData.append("file", saveFile);
      formData.append("description", receiptData.description);
      formData.append("amount", String(receiptData.amount));
      formData.append("category", receiptData.category);
      formData.append("date", receiptData.date);
      formData.append(
        "pageCount",
        String(scanMode === "multi" ? pages.length : 1)
      );

      const res = await fetch("/api/receipts/scan", { method: "PUT", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      onExpenseCreated(data.expense);
      clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold">Receipt Scanner</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Single page, multi-page scans, or one continuous panoramic photo for long receipts and
            reports.
          </p>
        </div>
        <DocumentScanModeToggle mode={scanMode} onChange={switchMode} accent="green" />
      </div>

      <div className="mt-4">
        {scanMode === "single" && (
          !preview ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-6 transition-colors hover:border-green-300 hover:bg-green-50"
              >
                <Camera className="h-6 w-6 text-green-600" />
                <span className="text-sm font-medium">Scan Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-6 transition-colors hover:border-green-300 hover:bg-green-50"
              >
                <Upload className="h-6 w-6 text-green-600" />
                <span className="text-sm font-medium">Upload Receipt</span>
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleSingleFile(f);
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleSingleFile(f);
                }}
              />
            </div>
          ) : (
            <CaptureActions
              preview={preview}
              previewAlt="Receipt"
              previewClass="max-w-xs"
              scanning={scanning}
              receiptData={receiptData}
              extractLabel="Extract Receipt Data"
              onScan={scanReceipt}
              onClear={clear}
              extractedForm={
                receiptData ? (
                  <ExtractedForm
                    receiptData={receiptData}
                    pageCountScanned={pageCountScanned}
                    wasPanoramic={wasPanoramic}
                    saving={saving}
                    onChange={setReceiptData}
                    onClear={clear}
                    onSave={saveExpense}
                  />
                ) : null
              }
            />
          )
        )}

        {scanMode === "panorama" && (
          <div className="space-y-4">
            <PanoramicScanCapture
              documentLabel="receipt"
              preview={preview}
              onSelectFile={(f) => void handleSingleFile(f)}
              onClear={clear}
              disabled={scanning || saving}
            />
            {preview && (
              <CaptureActions
                preview={preview}
                previewAlt="Panoramic receipt"
                previewClass="max-w-md"
                tallPreview
                scanning={scanning}
                receiptData={receiptData}
                extractLabel="Extract panoramic receipt"
                onScan={scanReceipt}
                onClear={clear}
                extractedForm={
                  receiptData ? (
                    <ExtractedForm
                      receiptData={receiptData}
                      pageCountScanned={pageCountScanned}
                      wasPanoramic={wasPanoramic || scanMode === "panorama"}
                      saving={saving}
                      onChange={setReceiptData}
                      onClear={clear}
                      onSave={saveExpense}
                    />
                  ) : null
                }
              />
            )}
          </div>
        )}

        {scanMode === "multi" && (
          <div className="space-y-4">
            <MultiPageScanCapture
              documentLabel="receipt"
              pages={pages}
              onPagesChange={(next) => {
                setPages(next);
                setReceiptData(null);
              }}
              onStitchedChange={setStitched}
              sessionComplete={sessionComplete}
              onSessionCompleteChange={setSessionComplete}
              disabled={scanning || saving}
            />

            {hasCapture && !receiptData && (
              <>
                <Button
                  onClick={scanReceipt}
                  disabled={scanning || !canExtractMulti}
                  className="w-full"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reading {pages.length} page{pages.length === 1 ? "" : "s"}…
                    </>
                  ) : (
                    `Extract from ${pages.length} page${pages.length === 1 ? "" : "s"} (panoramic stitch)`
                  )}
                </Button>
                {!canExtractMulti && pages.length === 1 && !sessionComplete && (
                  <p className="text-center text-xs text-slate-500">
                    Scan more pages or tap &quot;Done scanning&quot; to extract this report.
                  </p>
                )}
                <Button variant="secondary" onClick={clear} className="w-full">
                  Cancel
                </Button>
              </>
            )}

            {receiptData && (
              <ExtractedForm
                receiptData={receiptData}
                pageCountScanned={pageCountScanned}
                wasPanoramic={wasPanoramic}
                saving={saving}
                onChange={setReceiptData}
                onClear={clear}
                onSave={saveExpense}
              />
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function CaptureActions({
  preview,
  previewAlt,
  previewClass,
  tallPreview,
  scanning,
  receiptData,
  extractLabel,
  onScan,
  onClear,
  extractedForm,
}: {
  preview: string;
  previewAlt: string;
  previewClass: string;
  tallPreview?: boolean;
  scanning: boolean;
  receiptData: ReceiptData | null;
  extractLabel: string;
  onScan: () => void;
  onClear: () => void;
  extractedForm: React.ReactNode;
}) {
  if (receiptData) return <>{extractedForm}</>;

  if (tallPreview) {
    return (
      <>
        <Button onClick={onScan} disabled={scanning} className="w-full">
          {scanning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading panoramic image…
            </>
          ) : (
            extractLabel
          )}
        </Button>
        <Button variant="secondary" onClick={onClear} className="w-full">
          Cancel
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`relative mx-auto ${previewClass}`}>
        <Image
          src={preview}
          alt={previewAlt}
          width={300}
          height={400}
          className="rounded-lg object-contain"
          unoptimized
        />
      </div>
      <Button onClick={onScan} disabled={scanning} className="w-full">
        {scanning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Extracting data…
          </>
        ) : (
          extractLabel
        )}
      </Button>
      <Button variant="secondary" onClick={onClear} className="w-full">
        Cancel
      </Button>
    </div>
  );
}

function ExtractedForm({
  receiptData,
  pageCountScanned,
  wasPanoramic,
  saving,
  onChange,
  onClear,
  onSave,
}: {
  receiptData: ReceiptData;
  pageCountScanned: number;
  wasPanoramic: boolean;
  saving: boolean;
  onChange: (data: ReceiptData) => void;
  onClear: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="flex flex-wrap items-center gap-2 text-green-700">
        <CheckCircle className="h-5 w-5" />
        <span className="font-medium">Receipt data extracted</span>
        {wasPanoramic && pageCountScanned <= 1 && (
          <Badge className="bg-green-200/80 text-green-900">Panoramic scan</Badge>
        )}
        {pageCountScanned > 1 && (
          <Badge className="bg-green-200/80 text-green-900">
            {pageCountScanned} pages · panoramic stitch
          </Badge>
        )}
      </div>
      <FormField label="Description">
        <Input
          value={receiptData.description}
          onChange={(e) => onChange({ ...receiptData, description: e.target.value })}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Amount">
          <Input
            type="number"
            step="0.01"
            value={receiptData.amount}
            onChange={(e) =>
              onChange({ ...receiptData, amount: parseFloat(e.target.value) || 0 })
            }
          />
        </FormField>
        <FormField label="Date">
          <Input
            type="date"
            value={receiptData.date}
            onChange={(e) => onChange({ ...receiptData, date: e.target.value })}
          />
        </FormField>
      </div>
      <FormField label="Category">
        <Select
          value={receiptData.category}
          onChange={(e) => onChange({ ...receiptData, category: e.target.value })}
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </FormField>
      {receiptData.items.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-700">Line items detected:</p>
          <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-slate-500">
            {receiptData.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClear}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving} className="flex-1">
          {saving ? "Saving..." : `Save Expense (${formatCurrency(receiptData.amount)})`}
        </Button>
      </div>
    </div>
  );
}
