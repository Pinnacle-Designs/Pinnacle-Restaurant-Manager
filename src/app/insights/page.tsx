"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui";
import { InsightPanel } from "@/components/insights/InsightPanel";
import { ManagerAIAssistant } from "@/components/insights/ManagerAIAssistant";

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

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInsights = useCallback(async () => {
    const res = await fetch("/api/insights/analyze");
    const data = await res.json();
    setInsights(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  return (
    <div>
      <PageHeader
        title="AI Insights"
        description="Ask 350+ manager questions, run automated analysis, and get actionable answers from live data"
      />

      <div className="mb-8">
        <ManagerAIAssistant />
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading insights...</p>
      ) : (
        <InsightPanel insights={insights} onRefresh={fetchInsights} />
      )}

      <div className="mt-8 card">
        <h2 className="font-semibold text-slate-900">How AI Analysis Works</h2>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li>
            • Scans inventory levels, menu availability, staff count, orders, and
            expenses
          </li>
          <li>
            • Identifies pain points like low stock, negative margins, and staffing
            gaps
          </li>
          <li>
            • With an OpenAI API key, uses GPT for deeper contextual analysis
          </li>
          <li>
            • Without a key, uses rule-based detection for common restaurant issues
          </li>
          <li>• Photo uploads are analyzed to categorize and describe images</li>
        </ul>
        <p className="mt-4 text-xs text-slate-400">
          Set OPENAI_API_KEY in .env for full AI capabilities.
        </p>
      </div>
    </div>
  );
}
