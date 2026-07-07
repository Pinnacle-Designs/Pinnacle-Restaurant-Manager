export type PhotoDigitizeKind = "receipt" | "vendor_invoice" | "generic";

export interface PhotoDigitizePayload {
  version: 1;
  kind: PhotoDigitizeKind;
  summary: string;
  ocrSource?: string | null;
  memoryApplied?: boolean;
  expenseId?: string;
  invoiceId?: string;
  data?: Record<string, unknown>;
}

export function buildPhotoAnalysis(payload: PhotoDigitizePayload): string {
  return JSON.stringify(payload);
}

export function parsePhotoAnalysis(raw: string | null | undefined): PhotoDigitizePayload | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PhotoDigitizePayload>;
    if (parsed.version === 1 && parsed.kind && parsed.summary) {
      return parsed as PhotoDigitizePayload;
    }
  } catch {
    /* plain text from legacy analyzePhoto */
  }
  return null;
}

export function photoAnalysisSummary(raw: string | null | undefined): string {
  const structured = parsePhotoAnalysis(raw);
  if (structured) return structured.summary;
  return raw?.trim() ?? "";
}
