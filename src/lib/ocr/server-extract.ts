import { getServerTesseractOptions } from "./tesseract-options";

/** Server-side OCR fallback when the browser cannot read the image. */
export async function extractTextFromImageBuffer(buffer: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, getServerTesseractOptions());

  try {
    const { data } = await worker.recognize(buffer);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

export async function extractTextFromBase64Images(images: string | string[]): Promise<string> {
  const list = Array.isArray(images) ? images : [images];
  const parts: string[] = [];

  for (const b64 of list.slice(0, 2)) {
    const buffer = Buffer.from(b64, "base64");
    const text = (await extractTextFromImageBuffer(buffer)).trim();
    if (text) parts.push(text);
  }

  return parts.join("\n\n");
}
