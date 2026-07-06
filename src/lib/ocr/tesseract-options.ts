import type { LoggerMessage } from "tesseract.js";

export type OcrProgressHandler = (message: string) => void;

function tesseractBasePath(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/tesseract`;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (appUrl) return `${appUrl}/tesseract`;
  return "/tesseract";
}

export function buildTesseractLogger(onProgress?: OcrProgressHandler) {
  if (!onProgress) return () => undefined;

  return (message: LoggerMessage) => {
    if (message.status === "loading tesseract core") {
      onProgress("Loading OCR engine (first scan may take a moment)…");
      return;
    }
    if (message.status === "initializing tesseract") {
      onProgress("Starting OCR…");
      return;
    }
    if (message.status === "loading language traineddata") {
      onProgress("Loading language pack…");
      return;
    }
    if (message.status === "recognizing text") {
      const pct = Math.round((message.progress ?? 0) * 100);
      onProgress(`Reading text from photo… ${pct}%`);
    }
  };
}

export function getBrowserTesseractOptions(onProgress?: OcrProgressHandler) {
  const base = tesseractBasePath();
  return {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${base}/lang`,
    workerBlobURL: false,
    logger: buildTesseractLogger(onProgress),
  };
}

export function getServerTesseractOptions() {
  return {
    logger: () => undefined,
  };
}
