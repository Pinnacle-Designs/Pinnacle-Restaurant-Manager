"use client";

import Link from "next/link";
import { useRef, useState, useEffect } from "react";
import {
  ArrowRight,
  Loader2,
  Maximize2,
  Radar,
  RefreshCw,
} from "lucide-react";
import { MarketingNav } from "./MarketingNav";
import { DEMO_TOUR_STOPS } from "@/lib/marketing-content";
import { embedLaunchUrl } from "@/lib/embed-config";
import { cn } from "@/lib/utils";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";

export function DemoPage() {
  /** Always show full desktop app (sidebar + all modules) for customer demos. */
  const embedChrome = "full" as const;
  const [iframeLoading, setIframeLoading] = useState(true);
  const [activeStop, setActiveStop] = useState<(typeof DEMO_TOUR_STOPS)[number]>(DEMO_TOUR_STOPS[0]);
  const [iframeKey, setIframeKey] = useState(0);
  const readyRef = useRef(false);

  useEffect(() => {
    readyRef.current = false;
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
  }, []);

  const reloadIframe = () => {
    readyRef.current = false;
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
  };

  const selectStop = (stop: (typeof DEMO_TOUR_STOPS)[number]) => {
    readyRef.current = false;
    setActiveStop(stop);
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <MarketingNav />

      <div className="border-b border-white/10 bg-slate-900/50 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-orange-400" />
            <div>
              <p className="text-sm font-semibold text-white">Live interactive demo</p>
              <p className="text-xs text-slate-400">
                Demo session runs inside the frame · click modules to explore
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reloadIframe}
              disabled={iframeLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", iframeLoading && "animate-spin")} />
              Reset demo
            </button>
            <Link
              href={embedLaunchUrl(activeStop.path, embedChrome)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-400"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Open full screen
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Tour sidebar */}
        <aside className="w-full border-b border-white/10 bg-slate-900 lg:w-72 lg:border-b-0 lg:border-r">
          <div className="p-4">
            <PageSectionShell pageId="demo-tour" defaultExpanded="all">
              <PageSection id="demo-tour-stops" title="Tour the app" defaultOpen>
                <nav className="space-y-1">
                  {DEMO_TOUR_STOPS.map((stop) => (
                    <button
                      key={stop.id}
                      type="button"
                      onClick={() => selectStop(stop)}
                      disabled={iframeLoading}
                      className={cn(
                        "flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition",
                        activeStop.id === stop.id
                          ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/40"
                          : "text-slate-300 hover:bg-white/5",
                        iframeLoading && "opacity-50"
                      )}
                    >
                      <span className="text-sm font-medium">{stop.label}</span>
                      <span className="text-xs opacity-70">{stop.blurb}</span>
                    </button>
                  ))}
                </nav>
              </PageSection>
              <PageSection id="demo-command-center-tip" title="Command Center tip" defaultOpen>
                <p className="text-xs text-slate-400">
                  &quot;What&apos;s hurting my profit this week?&quot;
                </p>
                <button
                  type="button"
                  disabled={iframeLoading}
                  onClick={() => selectStop(DEMO_TOUR_STOPS.find((s) => s.id === "insights")!)}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 disabled:opacity-50"
                >
                  Go to Command Center
                  <ArrowRight className="h-3 w-3" />
                </button>
                <p className="mt-4 text-[10px] text-slate-500">
                  Demo: owner@pinnacle.com / demo1234
                </p>
              </PageSection>
            </PageSectionShell>
          </div>
        </aside>

        {/* Live app iframe — bootstraps demo session via /api/embed/launch */}
        <div className="relative flex flex-1 flex-col overflow-x-auto">
          {iframeLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90">
              <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
              <p className="mt-4 text-sm text-slate-300">Loading demo restaurant…</p>
              <p className="mt-1 text-xs text-slate-500">Seeding menu, staff, orders & analytics</p>
            </div>
          )}
          <iframe
            key={`${activeStop.path}-${embedChrome}-${iframeKey}`}
            src={embedLaunchUrl(activeStop.path, embedChrome)}
            title={`Pinnacle demo — ${activeStop.label}`}
            className="h-[calc(100vh-8rem)] min-w-[1024px] w-full flex-1 bg-white lg:h-[calc(100vh-7rem)]"
            onLoad={(e) => {
              if (readyRef.current) return;
              try {
                const frame = e.currentTarget.contentWindow;
                const search = frame?.location.search ?? "";
                const path = frame?.location.pathname ?? "";
                if (
                  path !== "/embed" &&
                  path !== "/api/embed/launch" &&
                  path !== "/login" &&
                  (search.includes("embed=full") ||
                    search.includes("embed=mobile") ||
                    search.includes("embed=1") ||
                    search.includes("_st="))
                ) {
                  readyRef.current = true;
                  setIframeLoading(false);
                }
              } catch {
                readyRef.current = true;
                setIframeLoading(false);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
