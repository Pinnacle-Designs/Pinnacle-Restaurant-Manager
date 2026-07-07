export type OcrSource = "ai" | "local" | "none";

export function isAiOcrConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OCR_DISABLE_AI !== "true");
}

/** OCR is always available — on-device Tesseract + local parsers; AI is optional enhancement. */
export function isDocumentOcrAvailable(): boolean {
  return true;
}

export function ocrSourceLabel(source: OcrSource): string {
  switch (source) {
    case "ai":
      return "AI extraction";
    case "local":
      return "On-device text recognition";
    default:
      return "Manual entry";
  }
}
