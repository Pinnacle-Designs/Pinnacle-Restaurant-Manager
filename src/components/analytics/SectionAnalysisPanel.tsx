"use client";

import { useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { INSIGHT_SEVERITY_COLORS } from "@/lib/constants";
import type { AnalyticsInsight } from "@/lib/analytics/types";
import type { AnalyticsSection } from "@/lib/analytics/section-insights";

export function SectionAnalysisPanel({
  section,
  questions,
  initialInsights,
}: {
  section: AnalyticsSection;
  questions: string[];
  initialInsights?: AnalyticsInsight[];
}) {
  const [insights, setInsights] = useState<AnalyticsInsight[]>(initialInsights ?? []);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(Boolean(initialInsights?.length));

  const runAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setInsights(data.insights ?? []);
      setHasRun(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="card border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">AI Analysis</h3>
          <p className="text-sm text-slate-500">
            Get insights for this category&apos;s key questions
          </p>
        </div>
        <Button onClick={runAnalysis} disabled={analyzing} size="sm">
          {analyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          {analyzing ? "Analyzing..." : "Run Analysis"}
        </Button>
      </div>

      <div className="mt-4 rounded-lg border bg-slate-50 p-3">
        <p className="text-xs font-medium uppercase text-slate-400">Questions answered</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {questions.map((q) => (
            <li key={q}>• {q}</li>
          ))}
        </ul>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!hasRun && !error && (
        <p className="mt-3 text-sm text-slate-500">
          Click Run Analysis to generate AI insights for this section.
        </p>
      )}

      {insights.length > 0 && (
        <ul className="mt-4 space-y-3">
          {insights.map((ins) => (
            <li key={ins.title} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={INSIGHT_SEVERITY_COLORS[ins.severity]}>{ins.severity}</Badge>
                <span className="font-medium text-slate-800">{ins.title}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{ins.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
