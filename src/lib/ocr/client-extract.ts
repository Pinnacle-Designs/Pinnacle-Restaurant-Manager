"use client";

import type { Worker } from "tesseract.js";
import { getBrowserTesseractOptions, type OcrProgressHandler } from "./tesseract-options";
import { preprocessImageFileForOcr } from "./image-preprocess";
import { recognizeWithBestPass } from "./run-tesseract";
import type { OcrTextKind } from "./ocr-text-score";

let workerPromise: Promise<Worker> | null = null;
let workerProgress: OcrProgressHandler | undefined;

async function getOcrWorker(onProgress?: OcrProgressHandler): Promise<Worker> {
  if (workerPromise && workerProgress === onProgress) {
    return workerPromise;
  }

  if (workerPromise) {
    try {
      const previous = await workerPromise;
      await previous.terminate();
    } catch {
      // ignore
    }
  }

  workerProgress = onProgress;
  workerPromise = (async () => {
    const { createWorker } = await import("tesseract.js");
    return createWorker("eng", 1, getBrowserTesseractOptions(onProgress));
  })();

  return workerPromise;
}

/** Run OCR — one preprocessed image, pick best layout pass (no noisy merging). */
export async function extractTextFromImageFile(
  file: File,
  onProgress?: OcrProgressHandler,
  kind: OcrTextKind = "generic"
): Promise<string> {
  onProgress?.("Enhancing photo for text recognition…");
  const worker = await getOcrWorker(onProgress);

  let input: Blob | File = file;
  try {
    input = await preprocessImageFileForOcr(file);
  } catch {
    /* use original */
  }

  return recognizeWithBestPass(worker, input, kind, onProgress);
}

/** Attach recognized text to a scan upload when not already present. */
export async function appendClientOcrText(
  formData: FormData,
  onProgress?: OcrProgressHandler,
  kind: OcrTextKind = "generic"
): Promise<string | null> {
  if (formData.get("ocrText")) {
    return String(formData.get("ocrText"));
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  try {
    onProgress?.("Preparing photo for text recognition…");
    const text = (await extractTextFromImageFile(file, onProgress, kind)).trim();
    if (text) {
      formData.set("ocrText", text);
      return text;
    }
    onProgress?.("No readable text found in this photo.");
  } catch (err) {
    console.warn("Client OCR failed:", err);
    onProgress?.("Could not read text on this device — we'll try again on the server.");
  }

  return null;
}
