import {
  isAiOcrConfigured,
  isDocumentOcrAvailable,
  type OcrSource,
} from "./capabilities";

/** Shared OCR metadata for invoice/receipt scan POST responses. */
export function buildScanOcrMeta(source: OcrSource) {
  return {
    ocrSource: source,
    /** @deprecated Use aiOcrConfigured — kept for backward compatibility. */
    ocrConfigured: isAiOcrConfigured(),
    aiOcrConfigured: isAiOcrConfigured(),
    documentOcrAvailable: isDocumentOcrAvailable(),
  };
}
