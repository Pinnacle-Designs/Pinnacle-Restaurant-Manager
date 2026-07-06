import type { OcrSource } from "@/lib/ocr/capabilities";
import { ocrSourceLabel } from "@/lib/ocr/capabilities";

export function ScanOcrNotice({ source }: { source: OcrSource | null | undefined }) {
  if (!source || source === "ai") {
    return null;
  }

  if (source === "local") {
    return (
      <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        {ocrSourceLabel(source)} — review the fields below and edit anything that looks off before
        saving.
      </p>
    );
  }

  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      We couldn&apos;t read much text from this photo. Enter the details manually, or retake the
      photo in good light with the full document in frame.
    </p>
  );
}
