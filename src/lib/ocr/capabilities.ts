export type OcrSource = "ai" | "local" | "none";

export function isAiOcrConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** OCR is always available — AI when configured, otherwise client-side text recognition. */
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
