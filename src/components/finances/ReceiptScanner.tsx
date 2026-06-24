"use client";

import { useState } from "react";
import { Loader2, Receipt, CheckCircle } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { Input, Select, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils";
import { submitScanForm } from "@/lib/scan/submit-scan";
import { DocumentScanModeToggle } from "@/components/scan/DocumentScanModeToggle";
import { DocumentQuickScanCapture } from "@/components/scan/DocumentQuickScanCapture";
import { useDocumentQuickScan } from "@/hooks/useDocumentQuickScan";

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
  const scan = useDocumentQuickScan();
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [pageCountScanned, setPageCountScanned] = useState(1);
  const [wasPanoramic, setWasPanoramic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAll = () => {
    scan.clear();
    setReceiptData(null);
    setPageCountScanned(1);
    setWasPanoramic(false);
    setError(null);
  };

  const scanReceipt = async () => {
    setScanning(true);
    setError(null);

    try {
      const formData = scan.buildScanFormData();
      const data = await submitScanForm<{
        receipt: ReceiptData;
        pageCount?: number;
        panoramic?: boolean;
      }>("/api/receipts/scan", formData);
      setReceiptData(data.receipt);
      setPageCountScanned(data.pageCount ?? scan.getPageCount());
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
      const saveFile = scan.getSaveFile();
      const formData = scan.buildScanFormData({
        description: receiptData.description,
        amount: String(receiptData.amount),
        category: receiptData.category,
        date: receiptData.date,
      });
      if (saveFile && !formData.has("file")) formData.append("file", saveFile);

      const data = await submitScanForm<{ expense: Expense }>(
        "/api/receipts/scan",
        formData,
        "PUT"
      );

      onExpenseCreated(data.expense);
      resetAll();
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
        <DocumentScanModeToggle mode={scan.scanMode} onChange={scan.switchMode} accent="green" />
      </div>

      <div className="mt-4">
        {!receiptData ? (
          <DocumentQuickScanCapture
            scan={scan}
            documentLabel="receipt"
            accent="green"
            disabled={scanning || saving}
            hideToggle
            showExtract
            extracting={scanning}
            onExtract={scanReceipt}
            extractLabel={
              scan.scanMode === "multi"
                ? `Extract from ${scan.pages.length} page${scan.pages.length === 1 ? "" : "s"} (panoramic stitch)`
                : scan.scanMode === "panorama"
                  ? "Extract panoramic receipt"
                  : "Extract Receipt Data"
            }
            onCancel={scan.hasCapture ? resetAll : undefined}
          />
        ) : (
          <ExtractedForm
            receiptData={receiptData}
            pageCountScanned={pageCountScanned}
            wasPanoramic={wasPanoramic || scan.scanMode === "panorama"}
            saving={saving}
            onChange={setReceiptData}
            onClear={resetAll}
            onSave={saveExpense}
          />
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
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
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            `Save Expense (${formatCurrency(receiptData.amount)})`
          )}
        </Button>
      </div>
    </div>
  );
}
