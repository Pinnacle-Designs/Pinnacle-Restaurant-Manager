"use client";

import { useState } from "react";
import { X, ZoomIn } from "lucide-react";

export function ScannedImageViewer({
  src,
  alt = "Scanned document",
  className = "",
  previewClassName = "max-h-56",
  emptyMessage = "No scan image saved for this document.",
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  previewClassName?: string;
  emptyMessage?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!src) {
    return (
      <div
        className={`rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`group relative block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${className}`}
        aria-label="View full-size scan"
      >
        <img
          src={src}
          alt={alt}
          className={`mx-auto w-full object-contain ${previewClassName}`}
        />
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ZoomIn className="h-3 w-3" />
          Tap to expand
        </span>
      </button>

      {expanded && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Full-size scan preview"
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={src}
            alt={alt}
            className="max-h-[92vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
