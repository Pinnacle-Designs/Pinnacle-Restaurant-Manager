"use client";

import type { Worker } from "tesseract.js";
import { pickBestOcrTextPassage, scoreOcrText, type OcrTextKind } from "./ocr-text-score";
import {
  preprocessImageFileForOcr,
  preprocessImageFileSoftForOcr,
  preprocessImageFileHighContrastForOcr,
} from "./image-preprocess";
import { recognizeAllPasses } from "./run-tesseract";
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

function dedupeCandidates(kind: OcrTextKind, passages: string[]): string[] {
  const seen = new Set<string>();
  const scored: Array<{ text: string; score: number }> = [];
  for (const passage of passages) {
    const trimmed = passage.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    scored.push({ text: trimmed, score: scoreOcrText(trimmed, kind) });
  }
  return scored.sort((a, b) => b.score - a.score).map((e) => e.text);
}

/** Run OCR on every preprocessing variant; return all unique passages (best first). */
export async function collectOcrTextCandidatesFromFile(
  file: File,
  onProgress?: OcrProgressHandler,
  kind: OcrTextKind = "generic"
): Promise<string[]> {
  onProgress?.("Enhancing photo for text recognition…");
  const worker = await getOcrWorker(onProgress);

  const allPassages: string[] = [];
  const inputs: Array<{ blob: Blob | File; label: string }> = [{ blob: file, label: "original photo" }];

  try {
    inputs.unshift({ blob: await preprocessImageFileForOcr(file), label: "enhanced photo" });
  } catch {
    /* use original only */
  }

  try {
    inputs.push({ blob: await preprocessImageFileSoftForOcr(file), label: "soft contrast photo" });
  } catch {
    /* optional */
  }

  try {
    inputs.push({ blob: await preprocessImageFileHighContrastForOcr(file), label: "high contrast photo" });
  } catch {
    /* optional */
  }

  for (const input of inputs) {
    onProgress?.(`Reading ${input.label}…`);
    const passages = await recognizeAllPasses(worker, input.blob, kind, onProgress);
    allPassages.push(...passages);
    const best = pickBestOcrTextPassage(kind, ...passages);
    if (scoreOcrText(best, kind) >= (kind === "invoice" ? 90 : 78)) break;
  }

  return dedupeCandidates(kind, allPassages);
}

/** Run OCR — multiple preprocessed images, pick best layout pass. */
export async function extractTextFromImageFile(
  file: File,
  onProgress?: OcrProgressHandler,
  kind: OcrTextKind = "generic"
): Promise<string> {
  const candidates = await collectOcrTextCandidatesFromFile(file, onProgress, kind);
  return pickBestOcrTextPassage(kind, ...candidates);
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
