"use client";

import { useRef } from "react";
import { Camera, Upload, ScanLine, FileImage } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ScannedImageViewer } from "@/components/scan/ScannedImageViewer";

interface PanoramicScanCaptureProps {
  documentLabel?: string;
  preview: string | null;
  onSelectFile: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
  accentClass?: "green" | "orange";
}

export function PanoramicScanCapture({
  documentLabel = "document",
  preview,
  onSelectFile,
  onClear,
  disabled = false,
  accentClass = "green",
}: PanoramicScanCaptureProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const accent = accentClass === "orange" ? "orange" : "green";
  const borderAccent =
    accent === "orange" ? "border-orange-100 bg-orange-50/50" : "border-green-100 bg-green-50/50";
  const textAccent = accent === "orange" ? "text-orange-900" : "text-green-900";
  const iconAccent = accent === "orange" ? "text-orange-600" : "text-green-600";
  const hoverAccent =
    accent === "orange" ? "hover:border-orange-300 hover:bg-orange-50" : "hover:border-green-300 hover:bg-green-50";

  if (!preview) {
    return (
      <div className="space-y-4">
        <div className={cn("rounded-xl border p-4", borderAccent)}>
          <div className={cn("flex items-center gap-2", textAccent)}>
            <ScanLine className="h-5 w-5" />
            <p className="font-medium">Panoramic scan</p>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Capture the full {documentLabel} in one continuous shot. On your phone, use{" "}
            <strong>Panorama mode</strong> and sweep slowly from the top of the {documentLabel} to
            the bottom. Or upload an existing long panoramic photo.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-5 transition-colors disabled:opacity-50",
              hoverAccent
            )}
          >
            <Camera className={cn("h-6 w-6", iconAccent)} />
            <span className="text-sm font-medium">Take panoramic photo</span>
            <span className="text-xs text-slate-400">Use phone panorama if available</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => uploadRef.current?.click()}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-5 transition-colors disabled:opacity-50",
              hoverAccent
            )}
          >
            <Upload className={cn("h-6 w-6", iconAccent)} />
            <span className="text-sm font-medium">Upload panoramic image</span>
            <span className="text-xs text-slate-400">One tall or wide JPEG/PNG</span>
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onSelectFile(f);
            e.target.value = "";
          }}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onSelectFile(f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <FileImage className="h-4 w-4" />
            Panoramic preview
          </div>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onClear}>
            Replace
          </Button>
        </div>
        <ScannedImageViewer
          src={preview}
          alt={`Panoramic ${documentLabel}`}
          previewClassName="max-h-[480px]"
          className="rounded-lg bg-white shadow-inner"
        />
        <p className="mt-2 text-center text-xs text-slate-500">
          Scroll to review the full panoramic {documentLabel}
        </p>
      </div>
    </div>
  );
}
