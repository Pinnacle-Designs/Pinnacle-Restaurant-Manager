"use client";

import { useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { PHOTO_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DocumentQuickScanCapture } from "@/components/scan/DocumentQuickScanCapture";
import { useDocumentQuickScan } from "@/hooks/useDocumentQuickScan";

interface PhotoUploaderProps {
  onUploadComplete?: () => void;
  defaultCategory?: string;
  excludeCategories?: string[];
}

export function PhotoUploader({
  onUploadComplete,
  defaultCategory = "OTHER",
  excludeCategories = [],
}: PhotoUploaderProps) {
  const categories = PHOTO_CATEGORIES.filter(
    (cat) => !excludeCategories.includes(cat.value)
  );
  const initialCategory = categories.some((c) => c.value === defaultCategory)
    ? defaultCategory
    : categories[0]?.value ?? "OTHER";

  const scan = useDocumentQuickScan();
  const [category, setCategory] = useState(initialCategory);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!scan.canExtract) return;
    setUploading(true);
    setError(null);

    try {
      const formData = scan.buildScanFormData({
        category,
        analyzeWithAI: "true",
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
      });

      const res = await fetch("/api/photos", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      scan.clear();
      setTitle("");
      setDescription("");
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card space-y-4">
      <h3 className="text-lg font-semibold">Upload Photo</h3>

      <DocumentQuickScanCapture
        scan={scan}
        documentLabel="photo"
        accent="orange"
        disabled={uploading}
        onCancel={scan.hasCapture ? scan.clear : undefined}
      />

      {scan.hasCapture && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    category === cat.value
                      ? "bg-orange-500 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fresh salmon delivery"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Notes (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional context..."
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button onClick={handleUpload} disabled={uploading || !scan.canExtract} className="w-full">
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading & analyzing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload & Analyze with AI
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
