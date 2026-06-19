"use client";

import Image from "next/image";
import { Camera, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import {
  DocumentScanModeToggle,
  type DocumentScanMode,
} from "@/components/scan/DocumentScanModeToggle";
import { MultiPageScanCapture } from "@/components/scan/MultiPageScanCapture";
import { PanoramicScanCapture } from "@/components/scan/PanoramicScanCapture";
import type { DocumentQuickScan } from "@/hooks/useDocumentQuickScan";

interface DocumentQuickScanCaptureProps {
  scan: DocumentQuickScan;
  documentLabel?: string;
  accent?: "green" | "orange";
  disabled?: boolean;
  /** Hide mode toggle (use when mode is fixed externally) */
  hideToggle?: boolean;
  /** Optional extract button below capture */
  extractLabel?: string;
  extracting?: boolean;
  onExtract?: () => void;
  /** Override canExtract from hook */
  canExtract?: boolean;
  showExtract?: boolean;
  onCancel?: () => void;
  children?: React.ReactNode;
}

export function DocumentQuickScanCapture({
  scan,
  documentLabel = "document",
  accent = "green",
  disabled = false,
  hideToggle = false,
  extractLabel = "Extract data",
  extracting = false,
  onExtract,
  canExtract: canExtractOverride,
  showExtract = false,
  onCancel,
  children,
}: DocumentQuickScanCaptureProps) {
  const {
    scanMode,
    switchMode,
    preview,
    file,
    pages,
    setPages,
    setStitched,
    sessionComplete,
    setSessionComplete,
    handleSingleFile,
    clear,
    canExtract,
    fileInputRef,
    cameraInputRef,
  } = scan;

  const canRunExtract = canExtractOverride ?? canExtract;
  const hoverAccent =
    accent === "orange" ? "hover:border-orange-300 hover:bg-orange-50" : "hover:border-green-300 hover:bg-green-50";
  const iconAccent = accent === "orange" ? "text-orange-600" : "text-green-600";

  const renderSingleCapture = () =>
    !preview ? (
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => cameraInputRef.current?.click()}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-6 transition-colors disabled:opacity-50 ${hoverAccent}`}
        >
          <Camera className={`h-6 w-6 ${iconAccent}`} />
          <span className="text-sm font-medium">Scan {documentLabel}</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-6 transition-colors disabled:opacity-50 ${hoverAccent}`}
        >
          <Upload className={`h-6 w-6 ${iconAccent}`} />
          <span className="text-sm font-medium">Upload {documentLabel}</span>
        </button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={disabled}
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
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleSingleFile(f);
          }}
        />
      </div>
    ) : (
      <div className="space-y-4">
        <div className="relative mx-auto max-w-xs">
          <Image
            src={preview}
            alt={documentLabel}
            width={300}
            height={400}
            className="rounded-lg object-contain"
            unoptimized
          />
        </div>
        {showExtract && onExtract && (
          <Button
            onClick={onExtract}
            disabled={disabled || extracting || !canRunExtract}
            className="w-full"
          >
            {extracting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              extractLabel
            )}
          </Button>
        )}
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} className="w-full" disabled={disabled}>
            Cancel
          </Button>
        )}
      </div>
    );

  return (
    <div className="space-y-4">
      {!hideToggle && (
        <DocumentScanModeToggle mode={scanMode} onChange={switchMode} accent={accent} />
      )}

      {scanMode === "single" && renderSingleCapture()}

      {scanMode === "panorama" && (
        <div className="space-y-4">
          <PanoramicScanCapture
            documentLabel={documentLabel}
            accentClass={accent}
            preview={preview}
            onSelectFile={(f) => void handleSingleFile(f)}
            onClear={clear}
            disabled={disabled}
          />
          {preview && showExtract && onExtract && (
            <Button
              onClick={onExtract}
              disabled={disabled || extracting || !canRunExtract}
              className="w-full"
            >
              {extracting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                extractLabel
              )}
            </Button>
          )}
          {preview && onCancel && (
            <Button variant="secondary" onClick={onCancel} className="w-full" disabled={disabled}>
              Cancel
            </Button>
          )}
        </div>
      )}

      {scanMode === "multi" && (
        <div className="space-y-4">
          <MultiPageScanCapture
            documentLabel={documentLabel}
            accentClass={accent}
            pages={pages}
            onPagesChange={setPages}
            onStitchedChange={setStitched}
            sessionComplete={sessionComplete}
            onSessionCompleteChange={setSessionComplete}
            disabled={disabled}
          />
          {pages.length > 0 && showExtract && onExtract && (
            <>
              <Button
                onClick={onExtract}
                disabled={disabled || extracting || !canRunExtract}
                className="w-full"
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing {pages.length} page{pages.length === 1 ? "" : "s"}…
                  </>
                ) : (
                  `${extractLabel} (${pages.length} page${pages.length === 1 ? "" : "s"})`
                )}
              </Button>
              {!canRunExtract && pages.length === 1 && !sessionComplete && (
                <p className="text-center text-xs text-slate-500">
                  Scan more pages or tap &quot;Done scanning&quot; to continue.
                </p>
              )}
            </>
          )}
          {pages.length > 0 && onCancel && (
            <Button variant="secondary" onClick={onCancel} className="w-full" disabled={disabled}>
              Cancel
            </Button>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

export type { DocumentScanMode };
