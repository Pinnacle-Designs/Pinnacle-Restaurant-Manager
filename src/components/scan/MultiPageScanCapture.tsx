"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Upload,
  ChevronUp,
  ChevronDown,
  Trash2,
  FileImage,
  Layers,
  CheckCircle2,
  ScanLine,
} from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  blobToFile,
  compressFileForUpload,
  filesToScanPages,
  readFileAsDataUrl,
  stitchDocumentPanorama,
  type ScanPage,
} from "@/lib/receipt/panorama-stitch";

export type { ScanPage };

export interface StitchedDocument {
  dataUrl: string;
  file: File;
}

interface MultiPageScanCaptureProps {
  /** e.g. receipt, invoice, report */
  documentLabel?: string;
  pages: ScanPage[];
  onPagesChange: (pages: ScanPage[]) => void;
  onStitchedChange?: (stitched: StitchedDocument | null) => void;
  /** Fired while the stitched upload JPEG is being built/compressed. */
  onPreparingChange?: (preparing: boolean) => void;
  /** Called when user finishes capturing and is ready to extract */
  onSessionComplete?: () => void;
  disabled?: boolean;
  accentClass?: string;
  /** Show extract-ready banner when session marked complete */
  sessionComplete?: boolean;
  onSessionCompleteChange?: (complete: boolean) => void;
}

export function MultiPageScanCapture({
  documentLabel = "document",
  pages,
  onPagesChange,
  onStitchedChange,
  onPreparingChange,
  onSessionComplete,
  disabled = false,
  accentClass = "green",
  sessionComplete: sessionCompleteProp,
  onSessionCompleteChange,
}: MultiPageScanCaptureProps) {
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionCompleteInternal, setSessionCompleteInternal] = useState(false);
  const [panoramaPreview, setPanoramaPreview] = useState<string | null>(null);
  const [buildingPanorama, setBuildingPanorama] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const sessionComplete = sessionCompleteProp ?? sessionCompleteInternal;
  const setSessionComplete = onSessionCompleteChange ?? setSessionCompleteInternal;

  const accent = {
    green: {
      border: "border-green-300",
      bg: "bg-green-50",
      text: "text-green-800",
      badge: "bg-green-100 text-green-800",
      btn: "hover:border-green-300 hover:bg-green-50",
      icon: "text-green-600",
    },
    orange: {
      border: "border-orange-300",
      bg: "bg-orange-50",
      text: "text-orange-900",
      badge: "bg-orange-100 text-orange-900",
      btn: "hover:border-orange-300 hover:bg-orange-50",
      icon: "text-orange-600",
    },
  }[accentClass === "orange" ? "orange" : "green"];

  const rebuildPanorama = useCallback(
    async (pageList: ScanPage[]) => {
      if (pageList.length === 0) {
        setPanoramaPreview(null);
        setPrepareError(null);
        onStitchedChange?.(null);
        onPreparingChange?.(false);
        return;
      }
      setPrepareError(null);
      if (pageList.length === 1) {
        onPreparingChange?.(true);
        try {
          const compressed = await compressFileForUpload(pageList[0].file);
          const dataUrl = await readFileAsDataUrl(compressed);
          setPanoramaPreview(dataUrl);
          onStitchedChange?.({ dataUrl, file: compressed });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Could not prepare image for upload";
          setPrepareError(message);
          onStitchedChange?.(null);
        } finally {
          onPreparingChange?.(false);
        }
        return;
      }
      setBuildingPanorama(true);
      onPreparingChange?.(true);
      try {
        const { dataUrl, blob } = await stitchDocumentPanorama(pageList.map((p) => p.dataUrl));
        setPanoramaPreview(dataUrl);
        onStitchedChange?.({
          dataUrl,
          file: blobToFile(blob, `${documentLabel}-panorama.jpg`),
        });
      } catch (err) {
        try {
          const compressed = await compressFileForUpload(pageList[0].file);
          const dataUrl = await readFileAsDataUrl(compressed);
          setPanoramaPreview(dataUrl);
          onStitchedChange?.({ dataUrl, file: compressed });
          setPrepareError(
            "Could not stitch all pages — only page 1 will be scanned. Try fewer pages or retake with less zoom."
          );
        } catch {
          const message =
            err instanceof Error ? err.message : "Could not prepare images for upload";
          setPrepareError(message);
          onStitchedChange?.(null);
        }
      } finally {
        setBuildingPanorama(false);
        onPreparingChange?.(false);
      }
    },
    [documentLabel, onStitchedChange, onPreparingChange]
  );

  useEffect(() => {
    void rebuildPanorama(pages);
  }, [pages, rebuildPanorama]);

  const addFiles = async (files: File[]) => {
    if (files.length === 0 || disabled) return;
    setSessionComplete(false);
    const newPages = await filesToScanPages(files);
    onPagesChange([...pages, ...newPages]);
    if (!sessionActive) setSessionActive(true);
  };

  const movePage = (index: number, direction: -1 | 1) => {
    const next = [...pages];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onPagesChange(next);
    setSessionComplete(false);
  };

  const removePage = (id: string) => {
    const next = pages.filter((p) => p.id !== id);
    onPagesChange(next);
    setSessionComplete(false);
    if (next.length === 0) {
      setSessionActive(false);
    }
  };

  const finishSession = () => {
    if (pages.length === 0) return;
    setSessionComplete(true);
    onSessionComplete?.();
  };

  const resetSession = () => {
    onPagesChange([]);
    setSessionActive(false);
    setSessionComplete(false);
    if (cameraRef.current) cameraRef.current.value = "";
    if (uploadRef.current) uploadRef.current.value = "";
  };

  const nextPageNumber = pages.length + 1;
  const waitingForNextScan = sessionActive && pages.length > 0 && !sessionComplete;

  return (
    <div className="space-y-4">
      {!sessionActive && pages.length === 0 ? (
        <div className="space-y-4">
          <div className={cn("rounded-xl border p-4", accent.bg, accent.border.replace("300", "100"))}>
            <div className={cn("flex items-center gap-2", accent.text)}>
              <Layers className="h-5 w-5" />
              <p className="font-medium">Multi-page {documentLabel} scan</p>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Scan one page at a time from top to bottom — overlap each photo slightly. We stitch
              pages into a panoramic report and read the full {documentLabel}.
            </p>
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={disabled}
            onClick={() => {
              setSessionActive(true);
              cameraRef.current?.click();
            }}
          >
            <ScanLine className="h-4 w-4" />
            Start multi-page scan
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={disabled}
            onClick={() => uploadRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Upload all pages at once
          </Button>
        </div>
      ) : (
        <>
          {waitingForNextScan && (
            <div className={cn("rounded-xl border-2 border-dashed p-4", accent.border, accent.bg)}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={cn("h-5 w-5", accent.icon)} />
                <p className={cn("font-semibold", accent.text)}>
                  Page {pages.length} captured
                </p>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Scan the next section below the overlap, or finish if you have the full {documentLabel}.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  className="flex-1"
                  disabled={disabled || buildingPanorama}
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera className="h-4 w-4" />
                  Scan page {nextPageNumber}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => uploadRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Add page
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled || pages.length === 0}
                  onClick={finishSession}
                >
                  Done scanning
                </Button>
              </div>
            </div>
          )}

          {sessionComplete && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-sm font-medium text-slate-700">
                {pages.length} page{pages.length === 1 ? "" : "s"} ready to extract
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={resetSession}>
                Start over
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge className={accent.badge}>
              {pages.length} page{pages.length === 1 ? "" : "s"}
            </Badge>
            {buildingPanorama && (
              <span className="text-xs text-slate-500">Building panorama…</span>
            )}
            {prepareError && (
              <span className="text-xs text-amber-700">{prepareError}</span>
            )}
            {!waitingForNextScan && !sessionComplete && pages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera className="h-3.5 w-3.5" />
                  Scan another page
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={finishSession}
                >
                  Done scanning
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page, index) => (
              <div
                key={page.id}
                className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                <div className="absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                  Page {index + 1}
                  {index === 0 && " · top"}
                  {index === pages.length - 1 && pages.length > 1 && " · bottom"}
                </div>
                <img
                  src={page.dataUrl}
                  alt={`${documentLabel} page ${index + 1}`}
                  className="h-36 w-full object-cover object-top"
                />
                <div className="flex items-center justify-between border-t border-slate-200 bg-white px-2 py-1">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={index === 0 || disabled}
                      onClick={() => movePage(index, -1)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      aria-label="Move page up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === pages.length - 1 || disabled}
                      onClick={() => movePage(index, 1)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      aria-label="Move page down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removePage(page.id)}
                    className="rounded p-1 text-red-500 hover:bg-red-50"
                    aria-label="Remove page"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {panoramaPreview && pages.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <FileImage className="h-4 w-4" />
                Panoramic preview
              </div>
              <div className="mx-auto max-h-[420px] max-w-md overflow-y-auto rounded-lg bg-white">
                <img
                  src={panoramaPreview}
                  alt={`Panoramic ${documentLabel}`}
                  className="w-full object-contain"
                />
              </div>
            </div>
          )}
        </>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const list = e.target.files ? Array.from(e.target.files) : [];
          void addFiles(list);
          e.target.value = "";
        }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const list = e.target.files ? Array.from(e.target.files) : [];
          void addFiles(list);
          if (list.length > 0) finishSession();
          e.target.value = "";
        }}
      />
    </div>
  );
}
