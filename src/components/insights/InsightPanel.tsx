"use client";

import { useState } from "react";
import Link from "next/link";
import { Brain, Loader2, ExternalLink } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";
import { INSIGHT_SEVERITY_COLORS } from "@/lib/constants";
import { showCriticalNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { ScannedImageViewer } from "@/components/scan/ScannedImageViewer";
import { parsePhotoAnalysis, photoAnalysisSummary } from "@/lib/photos/photo-analysis";

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
        <PhotoGalleryCard key={photo.id} photo={photo} />
      ))}
    </div>
  );
}

function PhotoGalleryCard({
  photo,
}: {
  photo: PhotoGalleryProps["photos"][number];
}) {
  const structured = parsePhotoAnalysis(photo.aiAnalysis);
  const summary = photoAnalysisSummary(photo.aiAnalysis);

  return (
    <div className="card overflow-hidden !p-0">
      <ScannedImageViewer
        src={photo.url}
        alt={photo.title || "Photo"}
        previewClassName="max-h-48"
      />
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-slate-900">
            {photo.title || "Untitled"}
          </h3>
          <Badge className="bg-slate-100 text-slate-600 text-xs">
            {photo.category.replace("_", " ")}
          </Badge>
        </div>
        {summary && (
          <p className="mt-2 text-xs text-slate-500 line-clamp-2">{summary}</p>
        )}
        {structured?.kind === "receipt" && structured.expenseId && (
          <Link
            href="/finances"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800"
          >
            <ExternalLink className="h-3 w-3" />
            View in Finances
          </Link>
        )}
        {structured?.kind === "vendor_invoice" && structured.invoiceId && (
          <Link
            href="/purchase-orders"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
          >
            <ExternalLink className="h-3 w-3" />
            View in Purchase Orders
          </Link>
        )}
      </div>
    </div>
  );
}
