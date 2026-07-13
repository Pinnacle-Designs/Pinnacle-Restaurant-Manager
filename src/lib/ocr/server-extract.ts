import { getServerTesseractOptions } from "./tesseract-options";
import { recognizeAllPasses } from "./run-tesseract";
import {
  preprocessImageBufferForOcr,
  preprocessImageBufferSoftForOcr,
  preprocessImageBufferAdaptiveForOcr,
} from "./server-image-preprocess";
import { pickBestOcrTextPassage, scoreOcrText, type OcrTextKind } from "./ocr-text-score";

const MAX_CANDIDATES = 8;

function dedupeSortedCandidates(kind: OcrTextKind, passages: string[]): string[] {
  const seen = new Set<string>();
  const scored: Array<{ text: string; score: number }> = [];
  for (const passage of passages) {
    const trimmed = passage.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    scored.push({ text: trimmed, score: scoreOcrText(trimmed, kind) });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((entry) => entry.text);
}

/** Collect OCR text from every preprocessing variant and Tesseract pass. */
export async function collectOcrTextCandidatesFromBuffer(
  buffer: Buffer,
  kind: OcrTextKind = "generic"
): Promise<string[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, getServerTesseractOptions());

  try {
    const allPassages: string[] = [];
    const variants: Array<{ buffer: Buffer; label: string }> = [{ buffer, label: "original" }];

    try {
      variants.unshift({ buffer: await preprocessImageBufferForOcr(buffer), label: "enhanced" });
    } catch {
      /* optional */
    }
    try {
      variants.push({ buffer: await preprocessImageBufferSoftForOcr(buffer), label: "soft" });
    } catch {
      /* optional */
    }
    try {
      variants.push({ buffer: await preprocessImageBufferAdaptiveForOcr(buffer), label: "adaptive" });
    } catch {
      /* optional */
    }

    for (const variant of variants) {
      const passages = await recognizeAllPasses(worker, variant.buffer, kind);
      allPassages.push(...passages);
      const best = pickBestOcrTextPassage(kind, ...passages);
      if (scoreOcrText(best, kind) >= (kind === "invoice" ? 90 : 78)) break;
    }

    return dedupeSortedCandidates(kind, allPassages);
  } finally {
    await worker.terminate();
  }
}

/** Server-side OCR with preprocessing + best-pass selection. */
export async function extractTextFromImageBuffer(
  buffer: Buffer,
  kind: OcrTextKind = "generic"
): Promise<string> {
  const candidates = await collectOcrTextCandidatesFromBuffer(buffer, kind);
  return pickBestOcrTextPassage(kind, ...candidates);
}

export async function collectOcrTextCandidatesFromBase64Images(
  images: string | string[],
  kind: OcrTextKind = "generic"
): Promise<string[]> {
  const list = Array.isArray(images) ? images : [images];
  const all: string[] = [];

  for (const b64 of list.slice(0, 3)) {
    const buffer = Buffer.from(b64, "base64");
    all.push(...(await collectOcrTextCandidatesFromBuffer(buffer, kind)));
  }

  return dedupeSortedCandidates(kind, all);
}

export async function extractTextFromBase64Images(
  images: string | string[],
  kind: OcrTextKind = "generic"
): Promise<string> {
  const candidates = await collectOcrTextCandidatesFromBase64Images(images, kind);
  return pickBestOcrTextPassage(kind, ...candidates);
}
