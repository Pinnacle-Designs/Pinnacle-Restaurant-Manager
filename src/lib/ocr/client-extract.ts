"use client";

import type { Worker } from "tesseract.js";
import { getBrowserTesseractOptions, type OcrProgressHandler } from "./tesseract-options";

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

/** Run OCR in the browser — loads engine from this app's /tesseract assets. */
export async function extractTextFromImageFile(
  file: File,
  onProgress?: OcrProgressHandler
): Promise<string> {
  const worker = await getOcrWorker(onProgress);
  const { data } = await worker.recognize(file);
  return data.text ?? "";
}

/** Attach recognized text to a scan upload when not already present. */
export async function appendClientOcrText(
  formData: FormData,
  onProgress?: OcrProgressHandler
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
    const text = (await extractTextFromImageFile(file, onProgress)).trim();
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
