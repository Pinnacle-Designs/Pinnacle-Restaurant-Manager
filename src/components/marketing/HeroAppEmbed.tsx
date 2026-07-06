"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, X } from "lucide-react";
import { embedLaunchUrl } from "@/lib/embed-config";
import { useEmbedChrome } from "@/hooks/useEmbedChrome";
import { cn } from "@/lib/utils";

interface HeroAppEmbedProps {
  title?: string;
  className?: string;
  /** Height of inline embed */
  height?: string;
}

function iframeHasEmbed(search: string): boolean {
  return (
    search.includes("embed=mobile") ||
    search.includes("embed=full") ||
    search.includes("embed=1")
  );
}

export function HeroAppEmbed({
  title = "Pinnacle Restaurant Manager — Live Demo",
  className,
  height = "min(520px, 70vh)",
}: HeroAppEmbedProps) {
  const embedChrome = useEmbedChrome();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const readyRef = useRef(false);
  const loadCountRef = useRef(0);
  const lastChromeRef = useRef(embedChrome);

  const mobileSrc = embedLaunchUrl(undefined, embedChrome);
  const fullSrc = embedLaunchUrl(undefined, "full");

  useEffect(() => {
    if (lastChromeRef.current === embedChrome) return;
    lastChromeRef.current = embedChrome;
    if (expanded) return;
    readyRef.current = false;
    loadCountRef.current = 0;
    setError(null);
    setLoading(true);
    setIframeKey((k) => k + 1);
  }, [embedChrome, expanded]);

  const retryEmbed = useCallback(() => {
    readyRef.current = false;
    loadCountRef.current = 0;
    setError(null);
    setLoading(true);
    setIframeKey((k) => k + 1);
  }, []);

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

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => {
      if (!readyRef.current) {
        setError("Demo timed out starting. Try refreshing — if this persists, the server database may need a redeploy.");
        setLoading(false);
      }
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [loading, mobileSrc, fullSrc, expanded]);

  const handleLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    if (readyRef.current) return;
    loadCountRef.current += 1;
    try {
      const frame = e.currentTarget.contentWindow;
      const search = frame?.location.search ?? "";
      const path = frame?.location.pathname ?? "";
      if (path === "/api/embed/launch" && loadCountRef.current >= 2) {
        setError("Could not start the demo. The server returned an error.");
        setLoading(false);
        return;
      }
      if (path !== "/embed" && path !== "/api/embed/launch" && iframeHasEmbed(search)) {
        readyRef.current = true;
        setLoading(false);
        setError(null);
      }
    } catch {
      if (loadCountRef.current >= 1) {
        window.setTimeout(() => {
          if (!readyRef.current) {
            readyRef.current = true;
            setLoading(false);
          }
        }, 1500);
      }
    }
  };

  const frame = (expandedView: boolean) => {
    const src = embedLaunchUrl(undefined, expandedView ? "full" : embedChrome);
    return (
    <iframe
      key={expandedView ? `modal-${iframeKey}` : `hero-${iframeKey}`}
      src={`${src}${src.includes("?") ? "&" : "?"}_=${iframeKey}`}
      title={title}
      className={cn(
        "w-full border-0 bg-white",
        expandedView ? "h-full min-h-0 flex-1" : "rounded-b-2xl"
      )}
      style={expandedView ? undefined : { height }}
      onLoad={handleLoad}
      allow="clipboard-write"
    />
    );
  };

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
            <span className="ml-1 truncate text-xs text-slate-400">
              Live demo — {embedChrome === "full" ? "full app" : "mobile app view"}
            </span>
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
          {loading && !expanded && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90"
              style={{ height }}
            >
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              <p className="mt-3 text-xs text-slate-400">Starting demo…</p>
            </div>
          )}
          {error && !loading && !expanded && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/95 px-6 text-center"
              style={{ height }}
            >
              <p className="text-sm text-slate-300">{error}</p>
              <button
                type="button"
                onClick={retryEmbed}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              >
                Retry
              </button>
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
                <span className="ml-1 text-sm font-medium text-slate-300">
                  {embedChrome === "mobile"
                    ? "Mobile app — bottom nav & compact layout"
                    : "Full desktop app — sidebar & all modules"}
                </span>
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
