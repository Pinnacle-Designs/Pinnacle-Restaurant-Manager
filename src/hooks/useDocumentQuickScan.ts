"use client";

import { useCallback, useRef, useState } from "react";
import type { DocumentScanMode } from "@/components/scan/DocumentScanModeToggle";
import { readFileAsDataUrl } from "@/lib/receipt/panorama-stitch";
import type { ScanPage, StitchedDocument } from "@/components/scan/MultiPageScanCapture";

export function useDocumentQuickScan(initialMode: DocumentScanMode = "single") {
  const [scanMode, setScanMode] = useState<DocumentScanMode>(initialMode);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [stitched, setStitched] = useState<StitchedDocument | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [wasPanoramic, setWasPanoramic] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const hasCapture = scanMode === "multi" ? pages.length > 0 : !!preview;
  const canExtract =
    scanMode === "multi"
      ? pages.length > 0 && (sessionComplete || pages.length > 1)
      : !!file && !!preview;

  const clear = useCallback(() => {
    setPreview(null);
    setFile(null);
    setPages([]);
    setStitched(null);
    setSessionComplete(false);
    setWasPanoramic(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }, []);

  const switchMode = useCallback(
    (mode: DocumentScanMode) => {
      if (mode === scanMode) return;
      clear();
      setScanMode(mode);
    },
    [scanMode, clear]
  );

  const handleSingleFile = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setPreview(await readFileAsDataUrl(selectedFile));
  }, []);

  const getSaveFile = useCallback((): File | null => {
    if (scanMode === "multi") {
      return stitched?.file ?? pages[0]?.file ?? null;
    }
    return file;
  }, [scanMode, stitched, pages, file]);

  const getPageCount = useCallback((): number => {
    return scanMode === "multi" ? pages.length : 1;
  }, [scanMode, pages.length]);

  const buildScanFormData = useCallback(
    (extra?: Record<string, string | Blob>) => {
      const formData = new FormData();
      formData.append("scanMode", scanMode);
      if (scanMode === "panorama" || wasPanoramic) {
        formData.append("panoramic", "true");
      }

      if (scanMode === "multi") {
        for (const page of pages) {
          formData.append("files", page.file);
        }
        formData.append("pageCount", String(pages.length));
        const saveFile = stitched?.file ?? pages[0]?.file;
        if (saveFile) formData.append("file", saveFile);
      } else if (file) {
        formData.append("file", file);
        formData.append("pageCount", "1");
      }

      if (extra) {
        for (const [key, value] of Object.entries(extra)) {
          formData.append(key, value);
        }
      }
      return formData;
    },
    [scanMode, wasPanoramic, pages, file, stitched]
  );

  return {
    scanMode,
    setScanMode,
    switchMode,
    clear,
    preview,
    file,
    pages,
    setPages,
    stitched,
    setStitched,
    sessionComplete,
    setSessionComplete,
    wasPanoramic,
    setWasPanoramic,
    hasCapture,
    canExtract,
    handleSingleFile,
    getSaveFile,
    getPageCount,
    buildScanFormData,
    fileInputRef,
    cameraInputRef,
  };
}

export type DocumentQuickScan = ReturnType<typeof useDocumentQuickScan>;
