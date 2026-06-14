"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroAppEmbedProps {
  /** e.g. `/embed` or `https://app.example.com/embed` */
  embedSrc: string;
  title?: string;
  className?: string;
  /** Height of inline embed */
  height?: string;
}

export function HeroAppEmbed({
  embedSrc,
  title = "Pinnacle Restaurant Manager — Live Demo",
  className,
  height = "min(520px, 70vh)",
}: HeroAppEmbedProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const closeModal = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded, closeModal]);

  const frame = (expandedView: boolean) => (
    <iframe
      src={embedSrc}
      title={title}
      className={cn(
        "w-full border-0 bg-white",
        expandedView ? "h-full min-h-0 flex-1" : "rounded-b-2xl"
      )}
      style={expandedView ? undefined : { height }}
      onLoad={(e) => {
        try {
          const frame = e.currentTarget.contentWindow;
          const search = frame?.location.search ?? "";
          const path = frame?.location.pathname ?? "";
          if (path !== "/embed" && search.includes("embed=1")) {
            setLoading(false);
          }
        } catch {
          setLoading(false);
        }
      }}
      allow="clipboard-write"
    />
  );

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50",
          className
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-slate-900/90 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-3 w-3 shrink-0 rounded-full bg-red-400" />
            <span className="h-3 w-3 shrink-0 rounded-full bg-amber-400" />
            <span className="h-3 w-3 shrink-0 rounded-full bg-emerald-400" />
            <span className="ml-1 truncate text-xs text-slate-400">Live demo — click around</span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
            aria-label="Expand demo to full window"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Expand
          </button>
        </div>
        <div className="relative">
          {loading && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90"
              style={{ height }}
            >
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              <p className="mt-3 text-xs text-slate-400">Starting demo…</p>
            </div>
          )}
          {frame(false)}
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded app demo"
        >
          <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
                <span className="ml-1 text-sm font-medium text-slate-300">{title}</span>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 flex-col">{frame(true)}</div>
          </div>
        </div>
      )}
    </>
  );
}
