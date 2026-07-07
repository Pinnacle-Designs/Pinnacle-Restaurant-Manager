import {
  isAiOcrConfigured,
  isDocumentOcrAvailable,
  type OcrSource,
} from "./capabilities";

/** Shared OCR metadata for invoice/receipt scan POST responses. */
export function buildScanOcrMeta(
  source: OcrSource,
  extras?: { memoryApplied?: boolean; memoryScanCount?: number }
) {
  return {
    ocrSource: source,
    memoryApplied: Boolean(extras?.memoryApplied),
    memoryScanCount: extras?.memoryScanCount ?? 0,
    /** @deprecated Use aiOcrConfigured — kept for backward compatibility. */
    ocrConfigured: isAiOcrConfigured(),
    aiOcrConfigured: isAiOcrConfigured(),
    documentOcrAvailable: isDocumentOcrAvailable(),
  };
}
