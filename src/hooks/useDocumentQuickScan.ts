"use client";

import { useCallback, useRef, useState } from "react";
import type { DocumentScanMode } from "@/components/scan/DocumentScanModeToggle";
import { readFileAsDataUrl, compressFileForUpload, MAX_UPLOAD_BYTES } from "@/lib/receipt/panorama-stitch";
import type { ScanPage, StitchedDocument } from "@/components/scan/MultiPageScanCapture";

export function useDocumentQuickScan(initialMode: DocumentScanMode = "single") {
  const [scanMode, setScanMode] = useState<DocumentScanMode>(initialMode);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [stitched, setStitched] = useState<StitchedDocument | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [wasPanoramic, setWasPanoramic] = useState(false);
  const [uploadPreparing, setUploadPreparing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const hasCapture = scanMode === "multi" ? pages.length > 0 : !!preview;
  const uploadFile =
    scanMode === "multi" ? stitched?.file ?? pages[0]?.file ?? null : file;

  const canExtract =
    scanMode === "multi"
      ? pages.length > 0 &&
        !uploadPreparing &&
        (sessionComplete || pages.length > 1) &&
        Boolean(uploadFile) &&
        (uploadFile?.size ?? Infinity) <= MAX_UPLOAD_BYTES &&
        (pages.length === 1 ? !!stitched : !!stitched?.file)
      : !!file && !!preview && file.size <= MAX_UPLOAD_BYTES;

  const clear = useCallback(() => {
    setPreview(null);
    setFile(null);
    setPages([]);
    setStitched(null);
    setSessionComplete(false);
    setWasPanoramic(false);
    setUploadPreparing(false);
    setCaptureError(null);
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
    try {
      setCaptureError(null);
      const compressed = await compressFileForUpload(selectedFile);
      setFile(compressed);
      setPreview(await readFileAsDataUrl(compressed));
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : "Could not process image");
      setFile(null);
      setPreview(null);
    }
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
        const uploadFile = stitched?.file ?? pages[0]?.file;
        if (uploadFile) {
          formData.append("file", uploadFile);
        }
        formData.append("pageCount", String(pages.length));
        formData.append("panoramic", "true");
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
    uploadPreparing,
    setUploadPreparing,
    captureError,
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
