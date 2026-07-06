"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";
import { InsightPanel } from "@/components/insights/InsightPanel";
import { ManagerAIAssistant } from "@/components/insights/ManagerAIAssistant";
import { clientFetch } from "@/lib/embed-api-client";

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
    const res = await clientFetch("/api/insights/analyze");
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
        title="Command Center"
        description="Your restaurant's AI brain — cross-checks every system and answers in plain English"
      />

      <PageSectionShell pageId="insights">
        <PageSection id="insights-command" title="Restaurant command center" defaultOpen>
          <ManagerAIAssistant />
        </PageSection>

        <PageSection
          id="insights-automated"
          title="Automated insights"
          description="AI flags issues between command center sessions"
        >
          {loading ? (
            <p className="text-sm text-slate-500">Loading insights...</p>
          ) : (
            <InsightPanel insights={insights} onRefresh={fetchInsights} />
          )}
        </PageSection>

        <PageSection id="insights-about" title="How the command center works">
          <ul className="space-y-2 text-sm text-slate-600">
            <li>
              • Pulls live data from sales, labor, inventory, scheduling, vendor invoices, waste
              logs, guest reviews, and employee performance — in one pass
            </li>
            <li>
              • Answers plain-English questions like &quot;What&apos;s hurting my profit this
              week?&quot; with cross-domain findings and dollar impacts
            </li>
            <li>
              • Shows a live red/yellow/green signal board for sales, profit, labor, food cost,
              guests, and operations
            </li>
            <li>
              • With OpenAI, synthesizes creative outputs (checklists, review responses) grounded
              in your real numbers
            </li>
            <li>• Automated insights above flag issues between command center sessions</li>
          </ul>
          <p className="mt-4 text-xs text-slate-400">
            Receipt and invoice scanning works without any API key. Add OpenAI in project settings
            for enhanced AI insights and vision extraction.
          </p>
        </PageSection>
      </PageSectionShell>
    </div>
  );
}
