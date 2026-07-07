import { getServerTesseractOptions } from "./tesseract-options";
import { recognizeWithBestPass } from "./run-tesseract";
import type { OcrTextKind } from "./ocr-text-score";

/** Server-side OCR with best-pass selection. */
export async function extractTextFromImageBuffer(
  buffer: Buffer,
  kind: OcrTextKind = "generic"
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, getServerTesseractOptions());

  try {
    return await recognizeWithBestPass(worker, buffer, kind);
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
