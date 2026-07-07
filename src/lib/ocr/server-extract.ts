import { getServerTesseractOptions } from "./tesseract-options";
import { recognizeWithBestPass } from "./run-tesseract";
import { preprocessImageBufferForOcr, preprocessImageBufferSoftForOcr } from "./server-image-preprocess";
import { pickBestOcrTextPassage, scoreOcrText, type OcrTextKind } from "./ocr-text-score";

/** Server-side OCR with preprocessing + best-pass selection. */
export async function extractTextFromImageBuffer(
  buffer: Buffer,
  kind: OcrTextKind = "generic"
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, getServerTesseractOptions());

  try {
    const candidates: string[] = [];
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

    for (const variant of variants) {
      const passage = await recognizeWithBestPass(worker, variant.buffer, kind);
      if (passage.trim()) candidates.push(passage);
      if (scoreOcrText(passage, kind) >= 78) break;
    }

    return pickBestOcrTextPassage(kind, ...candidates);
  } finally {
    await worker.terminate();
  }
}

export async function extractTextFromBase64Images(
  images: string | string[],
  kind: OcrTextKind = "generic"
): Promise<string> {
  const list = Array.isArray(images) ? images : [images];
  const parts: string[] = [];

  for (const b64 of list.slice(0, 3)) {
    const buffer = Buffer.from(b64, "base64");
    const text = (await extractTextFromImageBuffer(buffer, kind)).trim();
    if (text) parts.push(text);
  }

  return parts.join("\n\n");
}
