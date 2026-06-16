"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Camera, Upload, Loader2, FileText, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils";

export interface InvoiceLineData {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  sku?: string;
  inventoryItemId?: string;
}

export interface InvoiceData {
  vendor: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  lines: InvoiceLineData[];
}

interface InvoiceScanModalProps {
  poId?: string;
  receiptId?: string;
  onSaved: (result: { invoice: unknown; match: unknown; priceAlerts: unknown[] }) => void;
  onClose: () => void;
}

export function InvoiceScanModal({ poId, receiptId, onSaved, onClose }: InvoiceScanModalProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setInvoiceData(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(selectedFile);
  };

  const scanInvoice = async () => {
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/purchasing/invoices/scan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setInvoiceData(data.invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const saveInvoice = async () => {
    if (!invoiceData) return;
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      formData.append("vendor", invoiceData.vendor);
      formData.append("amount", String(invoiceData.amount));
      formData.append("invoiceDate", invoiceData.invoiceDate);
      formData.append("invoiceNumber", invoiceData.invoiceNumber);
      if (poId) formData.append("poId", poId);
      if (receiptId) formData.append("receiptId", receiptId);
      formData.append("lines", JSON.stringify(invoiceData.lines));

      const res = await fetch("/api/purchasing/invoices/scan", { method: "PUT", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Scan Vendor Invoice</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {!preview ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              Photograph a crinkled paper invoice — OCR extracts line items, quantities, and prices.
            </p>
            <Button onClick={() => cameraInputRef.current?.click()}>
              <Camera className="mr-2 h-4 w-4" /> Take Photo
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Upload Image
            </Button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative h-40 w-full overflow-hidden rounded-lg bg-slate-100">
              <Image src={preview} alt="Invoice preview" fill className="object-contain" unoptimized />
            </div>

            {!invoiceData ? (
              <Button onClick={scanInvoice} disabled={scanning} className="w-full">
                {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                {scanning ? "Reading invoice…" : "Extract line items"}
              </Button>
            ) : (
              <div className="space-y-3">
                <FormField label="Vendor">
                  <Input value={invoiceData.vendor} onChange={(e) => setInvoiceData({ ...invoiceData, vendor: e.target.value })} />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Invoice #">
                    <Input value={invoiceData.invoiceNumber} onChange={(e) => setInvoiceData({ ...invoiceData, invoiceNumber: e.target.value })} />
                  </FormField>
                  <FormField label="Total">
                    <Input type="number" step="0.01" value={invoiceData.amount} onChange={(e) => setInvoiceData({ ...invoiceData, amount: parseFloat(e.target.value) || 0 })} />
                  </FormField>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-xs font-medium uppercase text-slate-500">Line items</p>
                  {invoiceData.lines.map((line, i) => (
                    <div key={i} className="border-b border-slate-100 py-2 text-sm last:border-0">
                      <p className="font-medium">{line.description}</p>
                      <p className="text-slate-500">
                        {line.qty} {line.unit} × {formatCurrency(line.unitPrice)} = {formatCurrency(line.lineTotal)}
                      </p>
                    </div>
                  ))}
                </div>
                <Button onClick={saveInvoice} disabled={saving} className="w-full">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  Save & run three-way match
                </Button>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
