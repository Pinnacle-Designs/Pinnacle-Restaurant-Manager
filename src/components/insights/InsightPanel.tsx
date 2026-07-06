"use client";

import { useState } from "react";
import Image from "next/image";
import { Brain, Loader2 } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";
import { INSIGHT_SEVERITY_COLORS } from "@/lib/constants";
import { showCriticalNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";

interface Insight {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  actionable: string | null;
  resolved: boolean;
  createdAt: string;
}

interface InsightPanelProps {
  insights: Insight[];
  onRefresh?: () => void;
}

export function InsightPanel({ insights, onRefresh }: InsightPanelProps) {
  const [analyzing, setAnalyzing] = useState(false);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/insights/analyze", { method: "POST" });
      const data = await res.json();
      if (data.criticalInsights?.length > 0) {
        await showCriticalNotifications(data.criticalInsights);
      }
      onRefresh?.();
    } finally {
      setAnalyzing(false);
    }
  };

  const unresolved = insights.filter((i) => !i.resolved);
  const critical = unresolved.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH");

  return (
    <PageSectionShell pageId="insight-panel">
      <PageSection id="insight-summary" title="Insight summary" defaultOpen>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {unresolved.length} active insights · {critical.length} need attention
          </p>
          <Button onClick={runAnalysis} disabled={analyzing} size="sm">
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Brain className="h-4 w-4" />
            )}
            {analyzing ? "Analyzing..." : "Run Analysis"}
          </Button>
        </div>
      </PageSection>

      {unresolved.length === 0 ? (
        <PageSection id="insight-empty" title="Active insights">
          <div className="card text-center">
            <Brain className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-sm text-slate-500">
              No insights yet. Add data and run analysis to discover pain points.
            </p>
          </div>
        </PageSection>
      ) : (
        unresolved.map((insight) => (
          <PageSection
            key={insight.id}
            id={insight.id}
            title={insight.title}
            description={insight.category}
            headerActions={
              <Badge
                className={
                  INSIGHT_SEVERITY_COLORS[
                    insight.severity as keyof typeof INSIGHT_SEVERITY_COLORS
                  ]
                }
              >
                {insight.severity}
              </Badge>
            }
            className={cn(
              "border-l-4",
              insight.severity === "CRITICAL" && "border-l-red-500",
              insight.severity === "HIGH" && "border-l-orange-500",
              insight.severity === "MEDIUM" && "border-l-amber-500",
              insight.severity === "LOW" && "border-l-slate-300"
            )}
            variant="card"
          >
            <p className="text-sm text-slate-600">{insight.description}</p>
            {insight.actionable && (
              <p className="mt-2 text-sm font-medium text-orange-700">
                → {insight.actionable}
              </p>
            )}
          </PageSection>
        ))
      )}
    </PageSectionShell>
  );
}

interface PhotoGalleryProps {
  photos: Array<{
    id: string;
    url: string;
    title: string | null;
    category: string;
    aiAnalysis: string | null;
    createdAt: string;
  }>;
  categoryFilter?: string;
}

export function PhotoGallery({ photos, categoryFilter }: PhotoGalleryProps) {
  const filtered = categoryFilter
    ? photos.filter((p) => p.category === categoryFilter)
    : photos;

  if (filtered.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-sm text-slate-500">No photos in this category yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map((photo) => (
        <div key={photo.id} className="card overflow-hidden !p-0">
          <div className="relative aspect-video bg-slate-100">
            {photo.url.startsWith("data:") ? (
              <img
                src={photo.url}
                alt={photo.title || "Photo"}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <Image
                src={photo.url}
                alt={photo.title || "Photo"}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 33vw"
                unoptimized={photo.url.startsWith("/uploads/")}
              />
            )}
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-slate-900">
                {photo.title || "Untitled"}
              </h3>
              <Badge className="bg-slate-100 text-slate-600 text-xs">
                {photo.category.replace("_", " ")}
              </Badge>
            </div>
            {photo.aiAnalysis && (
              <p className="mt-2 text-xs text-slate-500 line-clamp-2">
                {photo.aiAnalysis}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
