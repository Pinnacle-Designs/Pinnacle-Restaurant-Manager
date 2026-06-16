"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Camera, Upload, Loader2, CheckCircle, AlertTriangle, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils";

interface CreditMemoModalProps {
  invoices?: Array<{ id: string; vendor: string; invoiceNumber: string | null; amount: number }>;
  defaultVendor?: string;
  defaultInvoiceId?: string;
  onSaved: (result: {
    credit: unknown;
    email?: { status: string; message: string };
    accountingLocked?: boolean;
    repEmail?: string;
  }) => void;
  onClose: () => void;
}

const CATEGORIES = [
  { value: "DAMAGED", label: "Damaged (shattered, crushed)" },
  { value: "SPOILED", label: "Spoiled / rotten" },
  { value: "SHORT_SHIP", label: "Short-shipped" },
  { value: "MISSING", label: "Missing from delivery" },
  { value: "OTHER", label: "Other" },
];

export function CreditMemoModal({
  invoices = [],
  defaultVendor = "",
  defaultInvoiceId,
  onSaved,
  onClose,
}: CreditMemoModalProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    vendor: defaultVendor,
    amount: "",
    reason: "",
    category: "DAMAGED",
    repEmail: "",
    invoiceId: defaultInvoiceId ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(selectedFile);
  };

  const scanPhoto = async () => {
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/purchasing/credits/scan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      const a = data.analysis;
      setForm((f) => ({
        ...f,
        vendor: a.vendor || f.vendor,
        amount: a.estimatedAmount > 0 ? String(a.estimatedAmount) : f.amount,
        reason: a.reason || f.reason,
        category: a.category || f.category,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const submit = async () => {
    const amount = parseFloat(form.amount);
    if (!form.vendor || !form.reason || !Number.isFinite(amount) || amount <= 0) {
      setError("Vendor, amount, and reason are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      formData.append("vendor", form.vendor);
      formData.append("amount", String(amount));
      formData.append("reason", form.reason);
      formData.append("category", form.category);
      if (form.repEmail) formData.append("repEmail", form.repEmail);
      if (form.invoiceId) formData.append("invoiceId", form.invoiceId);

      const res = await fetch("/api/purchasing/credits/request", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed");
      onSaved(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Request vendor credit</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          Snap damaged goods — Pinnacle emails your vendor rep, logs the credit, and{" "}
          <strong>locks accounting sync</strong> on the linked invoice so your bookkeeper will not pay the full amount.
        </p>

        {!preview ? (
          <div className="flex flex-col gap-3">
            <Button onClick={() => cameraInputRef.current?.click()}>
              <Camera className="mr-2 h-4 w-4" /> Take photo of damage
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Upload photo
            </Button>
            <Button variant="ghost" onClick={() => setPreview("skip")}>
              Skip photo — enter manually
            </Button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
          </div>
        ) : (
          <div className="space-y-4">
            {preview !== "skip" && (
              <div className="relative h-40 w-full overflow-hidden rounded-lg bg-slate-100">
                <Image src={preview} alt="Damage preview" fill className="object-contain" unoptimized />
              </div>
            )}

            {file && (
              <Button onClick={scanPhoto} disabled={scanning} variant="secondary" className="w-full">
                {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                {scanning ? "Analyzing damage…" : "AI: detect item & estimate credit"}
              </Button>
            )}

            <FormField label="Vendor">
              <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Sysco, US Foods…" />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Credit amount">
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </FormField>
              <FormField label="Category">
                <select
                  className="input w-full"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <FormField label="What happened?">
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Shattered glass cups in case" />
            </FormField>
            <FormField label="Vendor rep email (optional)">
              <Input type="email" value={form.repEmail} onChange={(e) => setForm({ ...form, repEmail: e.target.value })} placeholder="Auto-guessed if blank" />
            </FormField>
            {invoices.length > 0 && (
              <FormField label="Link invoice (locks AP sync)">
                <select
                  className="input w-full"
                  value={form.invoiceId}
                  onChange={(e) => {
                    const inv = invoices.find((i) => i.id === e.target.value);
                    setForm({
                      ...form,
                      invoiceId: e.target.value,
                      vendor: inv?.vendor ?? form.vendor,
                    });
                  }}
                >
                  <option value="">No invoice link</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.vendor} — {inv.invoiceNumber ?? "no #"} ({formatCurrency(inv.amount)})
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Credit request emailed to vendor rep immediately.</span>
              </div>
              {form.invoiceId && (
                <div className="mt-2 flex items-start gap-2">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>QuickBooks / Xero sync blocked for this invoice until credit memo is applied.</span>
                </div>
              )}
            </div>

            <Button onClick={submit} disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Submit credit request
            </Button>
          </div>
        )}

        {error && (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
