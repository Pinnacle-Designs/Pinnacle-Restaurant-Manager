"use client";

import type { OcrSource } from "@/lib/ocr/capabilities";

export function ScanOcrNotice({
  source,
  memoryApplied,
  memoryScanCount = 0,
}: {
  source: OcrSource | null | undefined;
  memoryApplied?: boolean;
  memoryScanCount?: number;
}) {
  if (!source && !memoryApplied) return null;

  return (
    <div className="space-y-2">
      {source === "ai" && (
        <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          AI read your invoice — review the fields below and edit anything that looks off before saving.
        </p>
      )}

      {source === "local" && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Text was read from your photo — review the fields below and edit anything that looks off
          before saving.
        </p>
      )}

      {source === "none" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          We couldn&apos;t read much text from this photo. Enter the details manually, or retake the
          photo in good light with the full document in frame.
        </p>
      )}

      {memoryApplied && (
        <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
          Applied learned patterns from {memoryScanCount} past verified scan
          {memoryScanCount === 1 ? "" : "s"} at this location — corrections you save teach the system
          for next time.
        </p>
      )}
    </div>
  );
}
